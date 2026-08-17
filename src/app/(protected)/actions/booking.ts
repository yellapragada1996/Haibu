"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings, offerings, creatorProfiles, blocks, ledgerEntries } from "@/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { addMinutes } from "date-fns";
import { revalidatePath } from "next/cache";

// Mark a reserved booking as PAID immediately after client-side
// confirmPayment succeeds, so the booking page shows the confirmed UI
// (join countdown + add-to-calendar) without waiting for the async Stripe
// webhook. The webhook is idempotent — when it arrives and sees
// status 'confirmed' it no-ops (no duplicate ledger, no refund).
export async function markBookingPaid(bookingId: string, paymentIntentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!booking || booking.fan_id !== user.id) return { error: "not_found" };
  if (booking.status === "confirmed") return { ok: true };
  if (booking.status !== "reserved") return { ok: true };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({ status: "confirmed" })
        .where(eq(bookings.id, bookingId));
      await tx.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "charge",
        amount_cents: booking.price_cents,
        stripe_reference: paymentIntentId,
      });
      await tx.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "platform_fee",
        amount_cents: booking.platform_fee_cents,
        stripe_reference: paymentIntentId,
      });
    });
  } catch (e: unknown) {
    // Unique violation on (stripe_reference, type) = the webhook already
    // recorded it — genuine idempotency, not a failure.
    if ((e as { code?: string }).code === "23505") return { ok: true };
    throw e;
  }
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function reserveSlot(offeringId: string, startAtIso: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" as const };

  const startAt = new Date(startAtIso);
  if (isNaN(startAt.getTime())) return { error: "invalid_slot" as const };

  // Fetch offering + creator
  const [offering] = await db
    .select({
      id: offerings.id,
      creator_id: offerings.creator_id,
      duration_minutes: offerings.duration_minutes,
      price_cents: offerings.price_cents,
      is_active: offerings.is_active,
      creator_published: creatorProfiles.is_published,
      creator_user_id: creatorProfiles.user_id,
    })
    .from(offerings)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, offerings.creator_id))
    .where(
      and(
        eq(offerings.id, offeringId),
        eq(offerings.is_active, true),
        isNull(offerings.deleted_at),
      ),
    );

  if (!offering || !offering.creator_published) {
    return { error: "invalid_slot" as const };
  }

  // Block enforcement: a blocked pairing cannot book in either direction.
  const [blockedPair] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(
          eq(blocks.blocker_id, user.id),
          eq(blocks.blocked_id, offering.creator_user_id),
        ),
        and(
          eq(blocks.blocker_id, offering.creator_user_id),
          eq(blocks.blocked_id, user.id),
        ),
      ),
    )
    .limit(1);
  if (blockedPair) return { error: "blocked" as const };

  const endAt = addMinutes(startAt, offering.duration_minutes);

  // Check min lead time (60 min)
  if (startAt <= addMinutes(new Date(), 60)) {
    return { error: "invalid_slot" as const };
  }

  // Check max advance-booking window (30 days)
  if (startAt > addMinutes(new Date(), 30 * 24 * 60)) {
    return { error: "invalid_slot" as const };
  }

  // Compute money split
  const platformFeeCents = Math.round(offering.price_cents * 0.18);
  const creatorPayoutCents = offering.price_cents - platformFeeCents;

  // (a) INSERT booking with status 'reserved', no PI id yet
  let bookingId: string;
  try {
    const [inserted] = await db
      .insert(bookings)
      .values({
        fan_id: user.id,
        creator_id: offering.creator_id,
        offering_id: offering.id,
        start_at: startAt,
        end_at: endAt,
        status: "reserved",
        price_cents: offering.price_cents,
        platform_fee_cents: platformFeeCents,
        creator_payout_cents: creatorPayoutCents,
        reservation_expires_at: addMinutes(new Date(), 10),
      })
      .returning({ id: bookings.id });
    bookingId = inserted.id;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      return { error: "slot_taken" as const };
    }
    return { error: "invalid_slot" as const };
  }

  // (b) Create PaymentIntent with booking id in metadata
  let paymentIntent: { id: string; client_secret: string | null };
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: offering.price_cents,
      currency: "usd",
      // v1 product decision: only card/wallet payments (no redirect-based methods).
      // Eliminates the return_url requirement on PI creation.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { booking_id: bookingId },
    });
  } catch (e) {
    // Clean up the reservation
    await db
      .update(bookings)
      .set({ status: "expired" })
      .where(eq(bookings.id, bookingId));
    return { error: "invalid_slot" as const };
  }

  // (c) Update booking with PI id
  try {
    await db
      .update(bookings)
      .set({ stripe_payment_intent_id: paymentIntent.id })
      .where(eq(bookings.id, bookingId));
  } catch {
    // Untracked PI — cancel it
    await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});
    await db
      .update(bookings)
      .set({ status: "expired" })
      .where(eq(bookings.id, bookingId));
    return { error: "invalid_slot" as const };
  }

  return {
    bookingId,
    clientSecret: paymentIntent.client_secret!,
  };
}
