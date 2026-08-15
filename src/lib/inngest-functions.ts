import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { bookings, creatorProfiles, ledgerEntries, reviews } from "@/db/schema";
import { eq, and, lt, lte, sql, count } from "drizzle-orm";
import { createRoom, getRoom } from "@/lib/daily";
import { stripe } from "@/lib/stripe";

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
        end_at: bookings.end_at,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId));

    if (!booking) return { message: "booking not found" };
    if (booking.daily_room_name) return { message: "room already exists" };

    const roomName = `booking-${bookingId.slice(0, 8)}`;

    let room: { name: string; url: string };
    try {
      room = await createRoom(roomName);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already exists") || msg.includes("duplicate") || msg.includes("name-not-available")) {
        room = await getRoom(roomName);
      } else {
        throw e;
      }
    }

    await db
      .update(bookings)
      .set({ daily_room_name: room.name, daily_room_url: room.url })
      .where(eq(bookings.id, bookingId));

    // Schedule session evaluation at end_at + 5 min grace
    if (booking.end_at) {
      await inngest.send({
        name: "booking/evaluate",
        data: { bookingId },
        ts: new Date(booking.end_at).getTime() + 5 * 60 * 1000,
      });
    }

    return { message: "room created", roomName: room.name };
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
        stripe_payment_intent_id: bookings.stripe_payment_intent_id,
      })
      .from(bookings)
      .where(
        and(
          sql`${bookings.status} IN ('completed', 'no_show_fan')`,
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

        const transfer = await stripe.transfers.create({
          amount: b.creator_payout_cents,
          currency: "usd",
          destination: profile.stripe_account_id,
          metadata: { booking_id: b.id },
        });

        await db.insert(ledgerEntries).values({
          booking_id: b.id,
          type: "creator_payout",
          amount_cents: -b.creator_payout_cents,
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

  const fanJoined = booking.fan_joined_at !== null;
  const creatorJoined = booking.creator_joined_at !== null;

  let outcome: string;
  let refund: boolean;

  if (fanJoined && creatorJoined) {
    outcome = "completed";
    refund = false;
  } else if (!fanJoined && creatorJoined) {
    outcome = "no_show_fan";
    refund = false;
  } else if (fanJoined && !creatorJoined) {
    outcome = "no_show_creator";
    refund = true;
  } else {
    // neither joined — treat as creator cancel for money flow,
    // but mark cancelled_by = 'system' so future admin logic
    // can distinguish real creator cancellations from mutual no-shows.
    outcome = "cancelled_creator";
    refund = true;
  }

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
  const holdMs = priorCompleted < 5 ? 7 * 86400000 : 72 * 3600000;
  const payoutEligibleAt = new Date(Date.now() + holdMs);

  // Update booking status with guard
  const extra = outcome === "cancelled_creator" && !fanJoined && !creatorJoined
    ? { cancelled_by: "system" as const, cancel_reason: "neither party joined" }
    : outcome === "no_show_creator"
      ? { cancelled_by: "system" as const, cancel_reason: "creator did not join" }
      : {};

  await db
    .update(bookings)
    .set({
      status: outcome as typeof booking.status,
      payout_eligible_at: payoutEligibleAt,
      ...extra,
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed")));

  // Refund if applicable
  if (refund && booking.stripe_payment_intent_id) {
    await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      reason: "requested_by_customer" as const,
    });

    // Ledger entries — each with its own 23505 catch
    try {
      await db.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "refund" as const,
        amount_cents: -booking.price_cents,
        stripe_reference: booking.stripe_payment_intent_id,
        note: `refund: session ${outcome}`,
      });
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== "23505") throw e;
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
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Review & rating: double-blind auto-publish
// ---------------------------------------------------------------------------

export const publishGuestReview = inngest.createFunction(
  {
    id: "review-publish",
    retries: 3,
    triggers: [{ event: "review/publish" }],
  },
  async ({ event }) => {
    const { reviewId } = event.data as { reviewId: string };

    const [review] = await db
      .select({
        id: reviews.id,
        is_public: reviews.is_public,
        reviewer_role: reviews.reviewer_role,
      })
      .from(reviews)
      .where(eq(reviews.id, reviewId));

    // Only guest reviews are ever public; a review already published by mutual
    // submission is left alone.
    if (!review || review.is_public || review.reviewer_role !== "guest") {
      return { message: "already published or not a guest review" };
    }

    await db
      .update(reviews)
      .set({ is_public: true, published_at: new Date() })
      .where(eq(reviews.id, reviewId));

    return { message: "published" };
  },
);
