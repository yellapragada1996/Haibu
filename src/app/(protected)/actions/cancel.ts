"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings, creatorProfiles, ledgerEntries, offerings, users } from "@/db/schema";
import { eq, and, lt, count, sql } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { revalidatePath } from "next/cache";
import { isPgErrorCode } from "@/lib/pg-errors";
import { cancellationRefundPercent, holdPeriodMs } from "@/lib/session-policy";
import { sendCancellationEmails } from "@/lib/email";

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
  return new Date(Date.now() + holdPeriodMs(priorCount));
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
      offering_id: bookings.offering_id,
      status: bookings.status,
      start_at: bookings.start_at,
      end_at: bookings.end_at,
      created_at: bookings.created_at,
      price_cents: bookings.price_cents,
      stripe_fee_cents: bookings.stripe_fee_cents,
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
    return { error: "Only the guest can cancel this booking" };
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

  // Refund calculation (§3/§4) — includes the 5-minute cooling-off grace for
  // guests and the tiered guest rule, centralized in session-policy.ts.
  // Stripe's processing fee is non-refundable, so the refund base is
  // price minus Stripe fee. The guest absorbs the fee, not Haibu.
  const refundPercent = cancellationRefundPercent(
    actor,
    booking.start_at,
    booking.created_at,
  );

  const stripeFeeCents = booking.stripe_fee_cents ?? 0;
  const netAmount = booking.price_cents - stripeFeeCents;
  const refundCents = Math.round(netAmount * refundPercent);
  const creatorPayoutFromCancellation =
    Math.round(booking.creator_payout_cents * (1 - refundPercent));
  const feeReversalCents = netAmount - refundCents - creatorPayoutFromCancellation;

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
        ? `guest cancelled (${Math.round(refundPercent * 100)}% refund)`
        : "creator cancelled",
      // The creator's net payout after this cancellation. The sweep reads this
      // (in place of creator_payout_cents) to actually transfer it later.
      effective_payout_cents: creatorPayoutFromCancellation,
      ...(payoutEligibleAt ? { payout_eligible_at: payoutEligibleAt } : {}),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed")));

  if (result.rowCount === 0) {
    return { error: "Booking already processed" };
  }

  // Send cancellation emails — only after the status transition has committed.
  // Any email failure is logged, never allowed to roll back the cancellation.
  try {
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
        scenario: actor === "fan" ? "guest_cancelled" : "creator_cancelled",
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
        stripeFeeCents,
        creatorPayoutCents: booking.creator_payout_cents,
        refundPercent,
      });
    }
  } catch (e) {
    console.error(
      `[email] cancellation email setup failed for booking ${bookingId}`,
      e,
    );
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
      if (!isPgErrorCode(e, "23505")) throw e;
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
      if (!isPgErrorCode(e, "23505")) throw e;
    }
    // The creator's cancellation share is NOT ledgered here — it's stored as
    // effective_payout_cents on the booking and paid out by the payout sweep,
    // so the money movement stays in one place.
  }

  revalidatePath(`/bookings/${bookingId}`);
  return { success: true, refunded_cents: refundCents };
}
