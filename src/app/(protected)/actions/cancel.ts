"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings, creatorProfiles, ledgerEntries } from "@/db/schema";
import { eq, and, lt, count, sql } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { revalidatePath } from "next/cache";

function computeFanRefundPercent(startAt: Date): number {
  const hours = (startAt.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hours > 24) return 1.0;
  if (hours >= 1) return 0.5;
  return 0;
}

async function computeHoldPeriod(creatorId: string, endAt: Date): Promise<Date> {
  const [prior] = await db
    .select({ cnt: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.creator_id, creatorId),
        sql`${bookings.status} IN ('completed', 'no_show_fan')`,
        lt(bookings.end_at, endAt),
      ),
    );
  const priorCount = prior?.cnt ?? 0;
  const holdMs = priorCount < 5 ? 7 * 24 * 60 * 60 * 1000 : 72 * 60 * 60 * 1000;
  return new Date(Date.now() + holdMs);
}

export async function cancelBooking(
  bookingId: string,
  actor: "fan" | "creator",
): Promise<{ success: true; refunded_cents: number } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [booking] = await db
    .select({
      id: bookings.id,
      fan_id: bookings.fan_id,
      creator_user_id: creatorProfiles.user_id,
      status: bookings.status,
      start_at: bookings.start_at,
      end_at: bookings.end_at,
      price_cents: bookings.price_cents,
      platform_fee_cents: bookings.platform_fee_cents,
      creator_payout_cents: bookings.creator_payout_cents,
      stripe_payment_intent_id: bookings.stripe_payment_intent_id,
    })
    .from(bookings)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .where(eq(bookings.id, bookingId));

  if (!booking) return { error: "Booking not found" };

  // Auth gate
  if (actor === "fan" && user.id !== booking.fan_id) {
    return { error: "Only the fan can cancel this booking" };
  }
  if (actor === "creator" && user.id !== booking.creator_user_id) {
    return { error: "Only the creator can cancel this booking" };
  }

  // Status guard
  if (booking.status !== "confirmed") {
    return { error: "Booking is not active" };
  }

  // Time guard — can't cancel a session that's already started
  if (!booking.start_at || booking.start_at <= new Date()) {
    return { error: "Session has already started" };
  }

  // Refund calculation
  const refundPercent =
    actor === "fan" ? computeFanRefundPercent(booking.start_at) : 1.0;

  const refundCents = Math.round(booking.price_cents * refundPercent);
  const feeReversalCents = Math.round(booking.platform_fee_cents * refundPercent);
  const creatorPayoutFromCancellation = booking.price_cents - refundCents - (booking.platform_fee_cents - feeReversalCents);

  // Hold period for creator's cancellation share (if any)
  let payoutEligibleAt: Date | null = null;
  if (creatorPayoutFromCancellation > 0 && booking.end_at) {
    const [cp] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.user_id, booking.creator_user_id));

    if (cp) {
      payoutEligibleAt = await computeHoldPeriod(cp.id, booking.end_at);
    }
  }

  const newStatus = actor === "fan" ? "cancelled_fan" : "cancelled_creator";

  // UPDATE with status guard — prevents double-cancellation
  const result = await db
    .update(bookings)
    .set({
      status: newStatus as typeof booking.status,
      cancelled_by: actor,
      cancel_reason: actor === "fan"
        ? `fan cancelled (${Math.round(refundPercent * 100)}% refund)`
        : "creator cancelled",
      ...(payoutEligibleAt ? { payout_eligible_at: payoutEligibleAt } : {}),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed")));

  if (result.rowCount === 0) {
    return { error: "Booking already processed" };
  }

  // Refund via Stripe
  if (refundCents > 0 && booking.stripe_payment_intent_id) {
    await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: refundCents,
      reason: "requested_by_customer",
    });

    try {
      await db.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "refund",
        amount_cents: -refundCents,
        stripe_reference: booking.stripe_payment_intent_id,
        note: `refund: ${actor} cancelled (${Math.round(refundPercent * 100)}%)`,
      });
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== "23505") throw e;
    }

    try {
      await db.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "platform_fee",
        amount_cents: -feeReversalCents,
        stripe_reference: `${booking.stripe_payment_intent_id}:fee_reversal`,
        note: `fee reversal: ${actor} cancelled`,
      });
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== "23505") throw e;
    }

    // Creator's non-refunded share (if partial refund)
    if (creatorPayoutFromCancellation > 0) {
      try {
        await db.insert(ledgerEntries).values({
          booking_id: bookingId,
          type: "creator_payout",
          amount_cents: -creatorPayoutFromCancellation,
          stripe_reference: `${booking.stripe_payment_intent_id}:cancellation_share`,
          note: `creator share from ${actor} cancellation (${100 - Math.round(refundPercent * 100)}% non-refunded)`,
        });
      } catch (e: unknown) {
        if ((e as { code?: string }).code !== "23505") throw e;
      }
    }
  }

  revalidatePath(`/bookings/${bookingId}`);
  return { success: true, refunded_cents: refundCents };
}
