"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { adminActions, bookings, creatorProfiles, ledgerEntries, offerings, participantEvents, platformSettings, reports, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { isPgErrorCode } from "@/lib/pg-errors";
import { computePresence, proportionalRefund } from "@/lib/session-policy";
import { sendCancellationEmails } from "@/lib/email";

// ---------------------------------------------------------------------------
// Admin server actions. Every action re-checks role_admin (defense in depth —
// the /admin layout already gates, but a forged action call must still fail).
// ---------------------------------------------------------------------------

const REPORT_STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

// Returns the admin's user id, or null if the caller is not an admin.
async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [row] = await db
    .select({ role_admin: users.role_admin })
    .from(users)
    .where(eq(users.id, user.id));

  return row?.role_admin === true ? user.id : null;
}

// Sends the admin-cancellation emails (guest + creator) after a booking has
// been moved to cancelled_admin. Admin refunds are currently always full, so
// refundPercent is fixed at 1 — but the email layer supports all three tiers.
async function sendAdminCancellationEmails(bookingId: string): Promise<void> {
  try {
    const [booking] = await db
      .select({
        fan_id: bookings.fan_id,
        creator_user_id: creatorProfiles.user_id,
        offering_id: bookings.offering_id,
        start_at: bookings.start_at,
        price_cents: bookings.price_cents,
        creator_payout_cents: bookings.creator_payout_cents,
      })
      .from(bookings)
      .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
      .where(eq(bookings.id, bookingId));
    if (!booking) return;

    const [offering] = await db
      .select({ title: offerings.title })
      .from(offerings)
      .where(eq(offerings.id, booking.offering_id));
    const [guestUser] = await db
      .select({
        name: users.display_name,
        email: users.email,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.id, booking.fan_id));
    const [creatorUser] = await db
      .select({
        name: users.display_name,
        email: users.email,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.id, booking.creator_user_id));

    if (offering && guestUser?.email && creatorUser?.email && booking.start_at) {
      await sendCancellationEmails({
        scenario: "admin_cancelled",
        bookingId,
        offeringTitle: offering.title,
        creator: {
          name: creatorUser.name ?? "The creator",
          email: creatorUser.email,
          timezone: creatorUser.timezone ?? "UTC",
        },
        guest: {
          name: guestUser.name ?? "The guest",
          email: guestUser.email,
          timezone: guestUser.timezone ?? "UTC",
        },
        startAt: booking.start_at,
        priceCents: booking.price_cents,
        creatorPayoutCents: booking.creator_payout_cents,
        refundPercent: 1,
      });
    }
  } catch (e) {
    console.error(
      `[email] admin cancellation email setup failed for booking ${bookingId}`,
      e,
    );
  }
}

export async function setReportStatus(
  reportId: string,
  status: ReportStatus,
): Promise<{ success: true } | { error: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: "Unauthorized" };
  if (!REPORT_STATUSES.includes(status)) return { error: "Invalid status" };

  await db.update(reports).set({ status }).where(eq(reports.id, reportId));

  revalidatePath("/admin");
  return { success: true };
}

export async function adminForceCancel(
  bookingId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: "Unauthorized" };

  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { error: "A reason is required" };

  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      price_cents: bookings.price_cents,
      platform_fee_cents: bookings.platform_fee_cents,
      stripe_payment_intent_id: bookings.stripe_payment_intent_id,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return { error: "Booking not found" };
  if (booking.status !== "confirmed") {
    return { error: "Only confirmed bookings can be force-cancelled" };
  }

  // confirmed -> cancelled_admin, guarded on current status (idempotent).
  // The reason is persisted on bookings.cancel_reason so it remains queryable.
  const result = await db
    .update(bookings)
    .set({
      status: "cancelled_admin",
      cancelled_by: "admin",
      cancel_reason: trimmed,
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed")));

  if (result.rowCount === 0) return { error: "Booking already processed" };

  await sendAdminCancellationEmails(booking.id);

  // Full refund + ledger (mirrors the shapes used in actions/cancel.ts).
  // Ordering intentionally matches cancel.ts: terminal status first, then
  // refund — so a failed refund can't leave a booking in a re-cancellable state.
  if (booking.price_cents > 0 && booking.stripe_payment_intent_id) {
    await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: booking.price_cents,
      reason: "requested_by_customer",
    });

    try {
      await db.insert(ledgerEntries).values({
        booking_id: booking.id,
        type: "refund",
        amount_cents: -booking.price_cents,
        stripe_reference: booking.stripe_payment_intent_id,
        note: `refund: admin force-cancel — ${trimmed}`,
      });
    } catch (e: unknown) {
      if (!isPgErrorCode(e, "23505")) throw e;
    }

    try {
      await db.insert(ledgerEntries).values({
        booking_id: booking.id,
        type: "platform_fee",
        amount_cents: -booking.platform_fee_cents,
        stripe_reference: `${booking.stripe_payment_intent_id}:fee_reversal`,
        note: `fee reversal: admin force-cancel — ${trimmed}`,
      });
    } catch (e: unknown) {
      if (!isPgErrorCode(e, "23505")) throw e;
    }
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  return { success: true };
}

export async function setUserSuspension(
  userId: string,
  suspend: boolean,
  reason?: string,
): Promise<{ success: true } | { error: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: "Unauthorized" };
  if (userId === adminId) {
    return { error: "You cannot suspend your own account" };
  }

  const trimmed = (reason ?? "").trim();
  if (suspend && !trimmed) return { error: "A reason is required" };

  // Supabase-native ban: '876000h' (~100 years) suspends, 'none' lifts it.
  const service = await createServiceClient();
  const { error } = await service.auth.admin.updateUserById(userId, {
    ban_duration: suspend ? "876000h" : "none",
  });
  if (error) return { error: error.message };

  // Audit trail — suspend was previously unlogged; now consistent with
  // force-cancel and no-show override.
  await db.insert(adminActions).values({
    admin_id: adminId,
    action: suspend ? "suspend" : "unsuspend",
    target_user_id: userId,
    reason: suspend ? trimmed : trimmed || "unsuspend",
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  revalidatePath("/admin/audit");
  return { success: true };
}

// ---------------------------------------------------------------------------
// No-show override (narrowed scope — see plan-review).
// Only `no_show_fan` is override-able without re-charging the fan:
//   - -> completed: status-only correction (money already correct).
//   - -> cancelled_admin: dispute refund (cancel pending payout; clawback of an
//     already-paid-out creator is deferred, NOT built in v1).
// `no_show_creator` / `cancelled_creator` are rejected: the fan was already
// refunded, so "-> completed" would require a second charge.
// ---------------------------------------------------------------------------

export async function noShowOverride(
  bookingId: string,
  target: "completed" | "refund",
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: "Unauthorized" };

  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { error: "A reason is required" };
  if (target !== "completed" && target !== "refund") {
    return { error: "Invalid override target" };
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      price_cents: bookings.price_cents,
      platform_fee_cents: bookings.platform_fee_cents,
      stripe_payment_intent_id: bookings.stripe_payment_intent_id,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return { error: "Booking not found" };

  if (booking.status !== "no_show_fan") {
    return { error: "Override is not supported for this booking status" };
  }

  if (target === "completed") {
    const result = await db
      .update(bookings)
      .set({ status: "completed" })
      .where(
        and(eq(bookings.id, bookingId), eq(bookings.status, "no_show_fan")),
      );
    if (result.rowCount === 0) return { error: "Booking already processed" };

    await db.insert(adminActions).values({
      admin_id: adminId,
      action: "no_show_override",
      booking_id: booking.id,
      reason: trimmed,
      details: "no_show_fan -> completed",
    });
  } else {
    const result = await db
      .update(bookings)
      .set({
        status: "cancelled_admin",
        cancelled_by: "admin",
        cancel_reason: trimmed,
        payout_eligible_at: null,
      })
      .where(
        and(eq(bookings.id, bookingId), eq(bookings.status, "no_show_fan")),
      );
    if (result.rowCount === 0) return { error: "Booking already processed" };

    await sendAdminCancellationEmails(booking.id);

    // Full refund + ledger (mirrors adminForceCancel). Skipped when there is
    // no payment intent (as with the manual test bookings in this dev DB).
    if (booking.price_cents > 0 && booking.stripe_payment_intent_id) {
      await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: booking.price_cents,
        reason: "requested_by_customer",
      });

      try {
        await db.insert(ledgerEntries).values({
          booking_id: booking.id,
          type: "refund",
          amount_cents: -booking.price_cents,
          stripe_reference: booking.stripe_payment_intent_id,
          note: `refund: no-show override — ${trimmed}`,
        });
      } catch (e: unknown) {
        if (!isPgErrorCode(e, "23505")) throw e;
      }

      try {
        await db.insert(ledgerEntries).values({
          booking_id: booking.id,
          type: "platform_fee",
          amount_cents: -booking.platform_fee_cents,
          stripe_reference: `${booking.stripe_payment_intent_id}:fee_reversal`,
          note: `fee reversal: no-show override — ${trimmed}`,
        });
      } catch (e: unknown) {
        if (!isPgErrorCode(e, "23505")) throw e;
      }
    }

    await db.insert(adminActions).values({
      admin_id: adminId,
      action: "no_show_override",
      booking_id: booking.id,
      reason: trimmed,
      details: "no_show_fan -> cancelled_admin",
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Needs-review resolution (Phase 5) — a flagged booking (needs_review = true,
// typically no_show_fan + partial creator presence) is resolved by an admin:
//   - pay_full:    dismiss flag, sweep pays the full creator_payout_cents.
//   - pay_reduced: set effective_payout_cents to the proportional amount.
//   - refund:      full refund to the guest (cancelled_admin).
// ---------------------------------------------------------------------------

export async function resolveNeedsReview(
  bookingId: string,
  outcome: "pay_full" | "pay_reduced" | "refund",
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: "Unauthorized" };

  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { error: "A reason is required" };
  if (outcome !== "pay_full" && outcome !== "pay_reduced" && outcome !== "refund") {
    return { error: "Invalid outcome" };
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      needs_review: bookings.needs_review,
      price_cents: bookings.price_cents,
      stripe_fee_cents: bookings.stripe_fee_cents,
      platform_fee_cents: bookings.platform_fee_cents,
      creator_id: bookings.creator_id,
      daily_room_name: bookings.daily_room_name,
      start_at: bookings.start_at,
      end_at: bookings.end_at,
      stripe_payment_intent_id: bookings.stripe_payment_intent_id,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return { error: "Booking not found" };
  if (!booking.needs_review) return { error: "Booking is not flagged for review" };

  if (outcome === "refund") {
    // Full refund: status → cancelled_admin, refund the guest, no payout.
    await db
      .update(bookings)
      .set({
        status: "cancelled_admin",
        cancelled_by: "admin",
        cancel_reason: trimmed,
        needs_review: false,
        payout_eligible_at: null,
        effective_payout_cents: null,
      })
      .where(eq(bookings.id, bookingId));

    await sendAdminCancellationEmails(booking.id);

    if (booking.price_cents > 0 && booking.stripe_payment_intent_id) {
      await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: booking.price_cents,
        reason: "requested_by_customer",
      });
      try {
        await db.insert(ledgerEntries).values({
          booking_id: bookingId,
          type: "refund",
          amount_cents: -booking.price_cents,
          stripe_reference: booking.stripe_payment_intent_id,
          note: `refund: review resolve — ${trimmed}`,
        });
      } catch (e: unknown) {
        if (!isPgErrorCode(e, "23505")) throw e;
      }
      try {
        await db.insert(ledgerEntries).values({
          booking_id: bookingId,
          type: "platform_fee",
          amount_cents: -booking.platform_fee_cents,
          stripe_reference: `${booking.stripe_payment_intent_id}:fee_reversal`,
          note: `fee reversal: review resolve — ${trimmed}`,
        });
      } catch (e: unknown) {
        if (!isPgErrorCode(e, "23505")) throw e;
      }
    }
  } else {
    // pay_full (null → sweep pays full) or pay_reduced (proportional amount).
    let effectivePayoutCents: number | null = null;
    if (outcome === "pay_reduced") {
      const [cp] = await db
        .select({ user_id: creatorProfiles.user_id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, booking.creator_id));
      let sessions: { joinedAtMs: number; durationMs: number }[] = [];
      if (cp?.user_id && booking.daily_room_name) {
        const leftEvents = await db
          .select({
            joined_at: participantEvents.joined_at,
            duration_seconds: participantEvents.duration_seconds,
          })
          .from(participantEvents)
          .where(
            and(
              eq(participantEvents.room_name, booking.daily_room_name),
              eq(participantEvents.user_id, `creator:${cp.user_id}`),
              eq(participantEvents.event_type, "left"),
            ),
          );
        sessions = leftEvents
          .filter((e) => e.duration_seconds != null)
          .map((e) => ({
            joinedAtMs: e.joined_at.getTime(),
            durationMs: Math.round(e.duration_seconds! * 1000),
          }));
      }
      const startMs = new Date(booking.start_at!).getTime();
      const endMs = new Date(booking.end_at!).getTime();
      const presence = computePresence(sessions, startMs, endMs);
      effectivePayoutCents = proportionalRefund(
        booking.price_cents,
        booking.platform_fee_cents,
        booking.stripe_fee_cents ?? 0,
        presence.undeliveredPercent,
      ).effectivePayoutCents;
    }
    await db
      .update(bookings)
      .set({ needs_review: false, effective_payout_cents: effectivePayoutCents })
      .where(eq(bookings.id, bookingId));
  }

  await db.insert(adminActions).values({
    admin_id: adminId,
    action: "resolve_review",
    booking_id: bookingId,
    reason: trimmed,
    details: outcome,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Update platform fee rate
// ---------------------------------------------------------------------------

export async function updatePlatformFeeRate(
  rate: number,
): Promise<{ success: true } | { error: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: "Unauthorized" };

  if (typeof rate !== "number" || !isFinite(rate) || rate < 0.01 || rate > 0.5) {
    return { error: "Rate must be between 1% and 50%" };
  }

  const rounded = Math.round(rate * 10000) / 10000;

  const [existing] = await db
    .select({ id: platformSettings.id, platform_fee_rate: platformSettings.platform_fee_rate })
    .from(platformSettings)
    .limit(1);

  const oldRate = existing?.platform_fee_rate ?? 0.18;

  if (existing) {
    await db
      .update(platformSettings)
      .set({ platform_fee_rate: rounded, updated_at: new Date(), updated_by: adminId })
      .where(eq(platformSettings.id, existing.id));
  } else {
    await db.insert(platformSettings).values({
      platform_fee_rate: rounded,
      updated_by: adminId,
    });
  }

  await db.insert(adminActions).values({
    admin_id: adminId,
    action: "update_fee_rate",
    reason: `Platform fee changed from ${(oldRate * 100).toFixed(1)}% to ${(rounded * 100).toFixed(1)}%`,
    details: `${oldRate} → ${rounded}`,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { success: true };
}
