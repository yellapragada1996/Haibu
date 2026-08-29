import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { bookings, creatorProfiles, ledgerEntries, users, offerings, participantEvents } from "@/db/schema";
import { eq, and, or, lt, lte, sql, count, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createOrGetRoom, getRoomMeetings } from "@/lib/daily";
import { stripe } from "@/lib/stripe";
import { isPgErrorCode } from "@/lib/pg-errors";
import { sendBookingReminder, sendBookingConfirmationEmails, sendRefundEmails, type ReminderWindow } from "@/lib/email";
import { evaluateSessionOutcome, holdPeriodMs, computePresence, needsCreatorReview, proportionalRefund } from "@/lib/session-policy";

const fanUser = alias(users, "fanUser");

// Loads the joined data needed to render a reminder email for a booking.
async function getReminderData(bookingId: string) {
  const [row] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      start_at: bookings.start_at,
      offering_title: offerings.title,
      fan_name: fanUser.display_name,
      fan_email: fanUser.email,
      fan_timezone: fanUser.timezone,
      creator_name: users.display_name,
      creator_email: users.email,
      creator_timezone: users.timezone,
    })
    .from(bookings)
    .innerJoin(offerings, eq(offerings.id, bookings.offering_id))
    .innerJoin(fanUser, eq(fanUser.id, bookings.fan_id))
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(eq(bookings.id, bookingId));
  return row;
}

// ---------------------------------------------------------------------------
// Step 6: Room creation on booking confirmed
// ---------------------------------------------------------------------------

export const handleBookingConfirmed = inngest.createFunction(
  {
    id: "booking-confirmed",
    retries: 5,
    triggers: [{ event: "booking/confirmed" }],
  },
  async ({ event }) => {
    const { bookingId } = event.data as { bookingId: string };

    const [booking] = await db
      .select({
        id: bookings.id,
        daily_room_name: bookings.daily_room_name,
        start_at: bookings.start_at,
        end_at: bookings.end_at,
        price_cents: bookings.price_cents,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId));

    if (!booking) return { message: "booking not found" };

    // Create room if not already created. The rest of the function (evaluation
    // + reminders) must run even on retries, so don't early-return here.
    let roomName = booking.daily_room_name;
    if (!roomName) {
      roomName = `booking-${bookingId.slice(0, 8)}`;
      const room = await createOrGetRoom(roomName);

      await db
        .update(bookings)
        .set({ daily_room_name: room.name, daily_room_url: room.url })
        .where(eq(bookings.id, bookingId));
    }

    // Send booking confirmation emails to both guest and creator.
    const confirmData = await getReminderData(bookingId);
    if (confirmData && confirmData.status === "confirmed") {
      try {
        await sendBookingConfirmationEmails({
          bookingId,
          offeringTitle: confirmData.offering_title,
          creator: {
            name: confirmData.creator_name,
            email: confirmData.creator_email,
            timezone: confirmData.creator_timezone,
          },
          guest: {
            name: confirmData.fan_name,
            email: confirmData.fan_email,
            timezone: confirmData.fan_timezone,
          },
          startAt: new Date(confirmData.start_at),
          priceCents: booking.price_cents,
        });
      } catch (e) {
        console.error(
          `[booking] confirmation email failed for ${bookingId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Schedule session evaluation at end_at + 5 min grace.
    // Inngest deduplicates by event id, so resending on retry is safe.
    if (booking.end_at) {
      await inngest.send({
        id: `evaluate-${bookingId}`,
        name: "booking/evaluate",
        data: { bookingId },
        ts: new Date(booking.end_at).getTime() + 5 * 60 * 1000,
      });
    }

    // Booking reminders. A reminder is only scheduled if it would fire at
    // least 5 minutes from now (startAt - offset > now + 5min). Bookings made
    // with less than 15 minutes before start skip the scheduled reminders and
    // instead send the imminent emails immediately.
    if (booking.start_at) {
      const startMs = new Date(booking.start_at).getTime();
      const nowMs = Date.now();
      const reminder1hMs = parseInt(process.env.REMINDER_1H_MS ?? "3600000", 10);
      const reminder15mMs = parseInt(process.env.REMINDER_15M_MS ?? "900000", 10);

      if (startMs - nowMs < 15 * 60 * 1000) {
        const data = await getReminderData(bookingId);
        if (data && data.status === "confirmed") {
          await sendBookingReminder({
            window: "imminent",
            bookingId,
            offeringTitle: data.offering_title,
            creator: {
              name: data.creator_name,
              email: data.creator_email,
              timezone: data.creator_timezone,
            },
            guest: {
              name: data.fan_name,
              email: data.fan_email,
              timezone: data.fan_timezone,
            },
            startAt: new Date(data.start_at),
          });
        }
      } else {
        const reminders: {
          id: string;
          name: string;
          data: { bookingId: string; window: string };
          ts: number;
        }[] = [];
        if (startMs - reminder1hMs > nowMs + 5 * 60 * 1000) {
          reminders.push({
            id: `reminder-1h-${bookingId}`,
            name: "booking/reminder",
            data: { bookingId, window: "1h" },
            ts: startMs - reminder1hMs,
          });
        }
        if (startMs - reminder15mMs > nowMs + 5 * 60 * 1000) {
          reminders.push({
            id: `reminder-15m-${bookingId}`,
            name: "booking/reminder",
            data: { bookingId, window: "15m" },
            ts: startMs - reminder15mMs,
          });
        }
        if (reminders.length > 0) {
          await inngest.send(reminders);
        }
      }
    }

    return { message: "done", roomName };
  },
);

// ---------------------------------------------------------------------------
// Step 14: Booking reminders (1h and 15m before start, guest + creator)
// ---------------------------------------------------------------------------

export const handleBookingReminder = inngest.createFunction(
  { id: "booking-reminder", retries: 3, triggers: [{ event: "booking/reminder" }] },
  async ({ event }) => {
    const { bookingId, window } = event.data as { bookingId: string; window: string };
    const reminderWindow: ReminderWindow = window === "15m" ? "15m" : "1h";

    const booking = await getReminderData(bookingId);

    if (!booking) return { message: "booking not found" };
    if (booking.status !== "confirmed") {
      return { message: `skipped: booking status is ${booking.status}` };
    }

    // Sanity check — a reminder that fires late (after start) must not send.
    if (new Date(booking.start_at).getTime() <= Date.now()) {
      return { message: "skipped: session already started" };
    }

    await sendBookingReminder({
      window: reminderWindow,
      bookingId,
      offeringTitle: booking.offering_title,
      creator: {
        name: booking.creator_name,
        email: booking.creator_email,
        timezone: booking.creator_timezone,
      },
      guest: {
        name: booking.fan_name,
        email: booking.fan_email,
        timezone: booking.fan_timezone,
      },
      startAt: new Date(booking.start_at),
    });

    return { message: `sent ${reminderWindow} reminders` };
  },
);

// ---------------------------------------------------------------------------
// Step 6: Reservation expiry sweep
// ---------------------------------------------------------------------------

export const sweepExpiredReservations = inngest.createFunction(
  { id: "sweep-expired-reservations", triggers: [{ cron: "*/2 * * * *" }] },
  async () => {
    const expired = await db
      .select({ id: bookings.id, stripe_payment_intent_id: bookings.stripe_payment_intent_id })
      .from(bookings)
      .where(and(eq(bookings.status, "reserved"), lt(bookings.reservation_expires_at, sql`NOW()`)));

    for (const b of expired) {
      if (b.stripe_payment_intent_id) {
        try { await stripe.paymentIntents.cancel(b.stripe_payment_intent_id); } catch {}
      }
      await db.update(bookings).set({ status: "expired" }).where(and(eq(bookings.id, b.id), eq(bookings.status, "reserved")));
    }

    return { swept: expired.length };
  },
);

// ---------------------------------------------------------------------------
// Step 9: Session evaluation — Tier 1 (scheduled per-booking)
// ---------------------------------------------------------------------------

export const evaluateSession = inngest.createFunction(
  { id: "evaluate-session", retries: 3, triggers: [{ event: "booking/evaluate" }] },
  async ({ event }) => {
    const { bookingId } = event.data as { bookingId: string };
    await runEvaluation(bookingId);
  },
);

// ---------------------------------------------------------------------------
// Step 9: Session evaluation — Tier 2 (hourly safety sweep)
// ---------------------------------------------------------------------------

export const sweepPendingEvaluations = inngest.createFunction(
  { id: "sweep-pending-evaluations", triggers: [{ cron: "0 * * * *" }] },
  async () => {
    const pending = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.status, "confirmed"), lt(bookings.end_at, sql`NOW() - INTERVAL '5 minutes'`)));

    for (const b of pending) {
      await runEvaluation(b.id);
    }

    return { evaluated: pending.length };
  },
);

// ---------------------------------------------------------------------------
// Step 9: Payout sweep (daily cron)
// ---------------------------------------------------------------------------

export const sweepEligiblePayouts = inngest.createFunction(
  { id: "sweep-eligible-payouts", triggers: [{ cron: "0 6 * * *" }] },
  async () => {
    const eligible = await db
      .select({
        id: bookings.id,
        creator_id: bookings.creator_id,
        creator_payout_cents: bookings.creator_payout_cents,
        effective_payout_cents: bookings.effective_payout_cents,
        stripe_payment_intent_id: bookings.stripe_payment_intent_id,
      })
      .from(bookings)
      .where(
        and(
          or(
            sql`${bookings.status} IN ('completed', 'no_show_fan', 'cancelled_fan')`,
            // A partial no_show (creator joined but missed >50%) is labeled
            // no_show_creator for tracking but still has a non-zero payout.
            and(
              eq(bookings.status, "no_show_creator"),
              sql`${bookings.effective_payout_cents} > 0`,
            ),
          ),
          eq(bookings.needs_review, false),
          lte(bookings.payout_eligible_at, sql`NOW()`),
        ),
      );

    let paid = 0;
    for (const b of eligible) {
      try {
        // Check if already paid out
        const [existingLedger] = await db
          .select({ id: ledgerEntries.id })
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.booking_id, b.id),
              eq(ledgerEntries.type, "creator_payout"),
            ),
          );
        if (existingLedger) continue;

        const [profile] = await db
          .select({ stripe_account_id: creatorProfiles.stripe_account_id })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, b.creator_id));

        if (!profile?.stripe_account_id) continue;

        // Pay the effective amount (reduced after a proportional refund).
        const payoutCents = b.effective_payout_cents ?? b.creator_payout_cents;
        if (payoutCents <= 0) continue;

        const transfer = await stripe.transfers.create({
          amount: payoutCents,
          currency: "usd",
          destination: profile.stripe_account_id,
          metadata: { booking_id: b.id },
        });

        await db.insert(ledgerEntries).values({
          booking_id: b.id,
          type: "creator_payout",
          amount_cents: -payoutCents,
          stripe_reference: transfer.id,
        });

        paid++;
      } catch (e) {
        // Per-booking try/catch — one failure doesn't block the batch.
        // Leave payout_eligible_at untouched so the next sweep retries.
        console.error(
          `[inngest] payout failed for booking ${b.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return { paid };
  },
);

// ---------------------------------------------------------------------------
// Evaluation logic (shared by Tier 1 and Tier 2)
// ---------------------------------------------------------------------------

export async function runEvaluation(bookingId: string) {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return;
  if (booking.status !== "confirmed") return;

  let fanJoined = booking.fan_joined_at !== null;
  let creatorJoined = booking.creator_joined_at !== null;

  // If either join is missing, verify against Daily's REST API before deciding.
  // This catches failures in webhooks AND client-side confirmation.
  let deferRefund = false;
  if ((!fanJoined || !creatorJoined) && booking.daily_room_name) {
    try {
      const meetings = await getRoomMeetings(booking.daily_room_name);
      for (const m of meetings) {
        for (const p of m.participants) {
          if (!fanJoined && p.user_id.startsWith("fan:")) {
            fanJoined = true;
            await db
              .update(bookings)
              .set({ fan_joined_at: new Date(m.start_time * 1000) })
              .where(and(eq(bookings.id, bookingId), isNull(bookings.fan_joined_at)));
          }
          if (!creatorJoined && p.user_id.startsWith("creator:")) {
            creatorJoined = true;
            await db
              .update(bookings)
              .set({ creator_joined_at: new Date(m.start_time * 1000) })
              .where(and(eq(bookings.id, bookingId), isNull(bookings.creator_joined_at)));
          }
        }
        if (fanJoined && creatorJoined) break;
      }
    } catch (e) {
      console.error(
        `[eval] Daily API check failed for ${bookingId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      // If we still have no join data AND the API is unreachable, defer the
      // refund for admin review but still transition the status (so the session
      // doesn't stay "confirmed" forever).
      if (!fanJoined && !creatorJoined) {
        deferRefund = true;
      }
    }
  }

  const { status: outcome, refund, cancelled_by, cancel_reason } =
    evaluateSessionOutcome(fanJoined, creatorJoined);

  // Count prior successful sessions for hold-period tier
  // Fix #3: count by end_at ordering, include both completed + no_show_fan
  const [priorRow] = await db
    .select({ cnt: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.creator_id, booking.creator_id),
        sql`${bookings.status} IN ('completed', 'no_show_fan')`,
        lt(bookings.end_at, booking.end_at!),
      ),
    );
  const priorCompleted = priorRow?.cnt ?? 0;
  const holdMs = holdPeriodMs(priorCompleted);
  const payoutEligibleAt = new Date(Date.now() + holdMs);

  // Phase 4 — compute the creator's presence and flag partial delivery for
  // admin review (the binary model can't see "joined but left early").
  let needsReview = false;
  let undeliveredPercent = 0;
  if (booking.daily_room_name && booking.start_at && booking.end_at) {
    const [creatorProfile] = await db
      .select({ user_id: creatorProfiles.user_id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, booking.creator_id));
    const creatorUserId = creatorProfile?.user_id;
    if (creatorUserId) {
      const leftEvents = await db
        .select({
          joined_at: participantEvents.joined_at,
          duration_seconds: participantEvents.duration_seconds,
        })
        .from(participantEvents)
        .where(
          and(
            eq(participantEvents.room_name, booking.daily_room_name),
            eq(participantEvents.user_id, `creator:${creatorUserId}`),
            eq(participantEvents.event_type, "left"),
          ),
        );
      const sessions = leftEvents
        .filter((e) => e.duration_seconds != null)
        .map((e) => ({
          joinedAtMs: e.joined_at.getTime(),
          durationMs: Math.round(e.duration_seconds! * 1000),
        }));
      const startMs = new Date(booking.start_at).getTime();
      const endMs = new Date(booking.end_at).getTime();
      const presence = computePresence(sessions, startMs, endMs);
      undeliveredPercent = presence.undeliveredPercent;
      needsReview = needsCreatorReview(presence, endMs - startMs);
    }
  }

  // Phase 5 — for a completed session where the creator partially delivered,
  // auto-issue a proportional refund and reduce the payout. (A no_show_fan with
  // a partially-present creator stays flagged for admin — ambiguous, since the
  // guest never showed but the creator also left early.)
  let effectivePayoutCents: number | null = null;
  let partialRefund: {
    refundCents: number;
    feeReversalCents: number;
  } | null = null;
  // §5 "Status vs. refund": the refund is continuous, but the status label uses
  // a discrete >50%-missed line. A creator who joined but missed >50% of the
  // session is labeled no_show_creator for tracking/review-eligibility, while
  // the refund stays proportional (not 100%).
  let finalStatus: "completed" | "no_show_fan" | "no_show_creator" | "cancelled_creator" = outcome;
  if (outcome === "completed" && needsReview) {
    const money = proportionalRefund(
      booking.price_cents,
      booking.platform_fee_cents,
      booking.stripe_fee_cents ?? 0,
      undeliveredPercent,
    );
    effectivePayoutCents = money.effectivePayoutCents;
    partialRefund = {
      refundCents: money.refundCents,
      feeReversalCents: money.feeReversalCents,
    };
    if (undeliveredPercent > 0.5) {
      finalStatus = "no_show_creator";
    }
    needsReview = false;
  }

  // Creator total no-show or mutual no-show → creator earns nothing.
  // Skip when deferred (admin will decide).
  if (refund && !deferRefund && effectivePayoutCents == null) {
    effectivePayoutCents = 0;
  }

  // When the Daily API was unreachable and we have no join evidence at all,
  // flag for admin review — no money moves until a human looks at it.
  if (deferRefund) needsReview = true;

  // Issue Stripe refunds BEFORE transitioning the booking status. If Stripe
  // fails, the status stays "confirmed" and Inngest retries correctly. The
  // idempotency key + ledger unique constraint prevent double-refunding.
  const stripeFeeCents = booking.stripe_fee_cents ?? 0;

  // Full refund — no-show / mutual no-show. Skipped when the Daily API was
  // unreachable and we have no evidence either way (admin decides).
  if (refund && booking.stripe_payment_intent_id && !deferRefund) {
    const fullRefundCents = booking.price_cents - stripeFeeCents;

    await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: fullRefundCents,
      reason: "requested_by_customer" as const,
    }, { idempotencyKey: `eval-refund-${bookingId}` });

    try {
      await db.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "refund" as const,
        amount_cents: -fullRefundCents,
        stripe_reference: booking.stripe_payment_intent_id,
        note: `refund: session ${outcome} (after processing fees)`,
      });
    } catch (e: unknown) {
      if (!isPgErrorCode(e, "23505")) throw e;
    }

    try {
      await db.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "platform_fee" as const,
        amount_cents: -booking.platform_fee_cents,
        stripe_reference: `${booking.stripe_payment_intent_id}:fee_reversal`,
        note: `fee reversal: session ${outcome}`,
      });
    } catch (e: unknown) {
      if (!isPgErrorCode(e, "23505")) throw e;
    }
  }

  // Partial refund — creator partially delivered a completed session (Phase 5).
  if (partialRefund && booking.stripe_payment_intent_id) {
    await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: partialRefund.refundCents,
      reason: "requested_by_customer" as const,
    }, { idempotencyKey: `eval-partial-${bookingId}` });

    try {
      await db.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "refund" as const,
        amount_cents: -partialRefund.refundCents,
        stripe_reference: `${booking.stripe_payment_intent_id}:partial`,
        note: `proportional refund: creator delivered ${Math.round((1 - undeliveredPercent) * 100)}%`,
      });
    } catch (e: unknown) {
      if (!isPgErrorCode(e, "23505")) throw e;
    }

    try {
      await db.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "platform_fee" as const,
        amount_cents: -partialRefund.feeReversalCents,
        stripe_reference: `${booking.stripe_payment_intent_id}:partial_fee_reversal`,
        note: `proportional fee reversal`,
      });
    } catch (e: unknown) {
      if (!isPgErrorCode(e, "23505")) throw e;
    }
  }

  // Transition booking status AFTER money has moved. The optimistic lock on
  // "confirmed" prevents duplicate transitions; retries re-enter cleanly
  // because the refund steps above are idempotent.
  const extra =
    cancelled_by && cancel_reason
      ? { cancelled_by, cancel_reason }
      : {};

  await db
    .update(bookings)
    .set({
      status: finalStatus,
      payout_eligible_at: payoutEligibleAt,
      needs_review: needsReview,
      ...(effectivePayoutCents != null
        ? { effective_payout_cents: effectivePayoutCents }
        : {}),
      ...extra,
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed")));

  // Notification emails — best-effort, after status is committed.
  if (refund && booking.stripe_payment_intent_id && !deferRefund) {
    const fullRefundCents = booking.price_cents - stripeFeeCents;
    const partyData = await getReminderData(bookingId);
    if (partyData) {
      await sendRefundEmails({
        scenario: "full",
        bookingId,
        offeringTitle: partyData.offering_title,
        creator: { name: partyData.creator_name, email: partyData.creator_email, timezone: partyData.creator_timezone },
        guest: { name: partyData.fan_name, email: partyData.fan_email, timezone: partyData.fan_timezone },
        startAt: new Date(partyData.start_at!),
        priceCents: booking.price_cents,
        stripeFeeCents,
        refundCents: fullRefundCents,
        effectivePayoutCents: null,
        deliveredPercent: 0,
      });
    }
  }

  if (partialRefund && booking.stripe_payment_intent_id) {
    const partyData = await getReminderData(bookingId);
    if (partyData) {
      await sendRefundEmails({
        scenario: "partial",
        bookingId,
        offeringTitle: partyData.offering_title,
        creator: { name: partyData.creator_name, email: partyData.creator_email, timezone: partyData.creator_timezone },
        guest: { name: partyData.fan_name, email: partyData.fan_email, timezone: partyData.fan_timezone },
        startAt: new Date(partyData.start_at!),
        priceCents: booking.price_cents,
        stripeFeeCents,
        refundCents: partialRefund.refundCents,
        effectivePayoutCents: effectivePayoutCents,
        deliveredPercent: 1 - undeliveredPercent,
      });
    }
  }
}

