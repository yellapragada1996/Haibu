import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { creatorProfiles, bookings, ledgerEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import Stripe from "stripe";
import { isPgErrorCode } from "@/lib/pg-errors";

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "account.updated":
        await handleAccountUpdated(event);
        break;
      case "identity.verification_session.verified":
        await handleIdentityVerified(event);
        break;
      case "identity.verification_session.requires_input":
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event);
        break;
      case "payment_intent.canceled":
        await handlePaymentIntentCanceled(event);
        break;
      default:
        // Other event types Stripe sends that we don't handle yet —
        // log for visibility, return 200 so Stripe doesn't retry.
        console.log(`[stripe] unhandled event type: ${event.type}`);
        break;
    }
  } catch (e) {
    console.error(`[stripe] webhook error: ${event.type}`, e);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleAccountUpdated(event: Stripe.Event) {
  const account = event.data.object as Stripe.Account;
  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.stripe_account_id, account.id));
  if (!profile) return;

  const wasComplete = profile.stripe_onboarding_complete;
  const isNowCapable = account.charges_enabled === true && account.payouts_enabled === true;

  if (isNowCapable && !wasComplete) {
    await db.update(creatorProfiles).set({ stripe_onboarding_complete: true }).where(eq(creatorProfiles.id, profile.id));
  }
  if (!isNowCapable && wasComplete) {
    await db.update(creatorProfiles).set({ stripe_onboarding_complete: false, is_published: false }).where(eq(creatorProfiles.id, profile.id));
  }
}

async function handleIdentityVerified(event: Stripe.Event) {
  const session = event.data.object as Stripe.Identity.VerificationSession;
  const cpId = session.metadata?.creator_profile_id;
  if (!cpId) return;
  await db.update(creatorProfiles).set({ identity_verified: true }).where(eq(creatorProfiles.id, cpId));
}

// ---------------------------------------------------------------------------
// PaymentIntent handlers
// ---------------------------------------------------------------------------

async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const bookingId = pi.metadata?.booking_id;
  if (!bookingId) return;

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) return;

  // Truly idempotent — already confirmed
  if (booking.status === "confirmed") return;

  // Money captured but booking not reservable anymore — auto-refund
  if (booking.status !== "reserved") {
    await stripe.refunds.create({
      payment_intent: pi.id,
      reason: "requested_by_customer" as Stripe.RefundCreateParams.Reason,
    });
    try {
      await db.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "refund",
        amount_cents: -booking.price_cents,
        stripe_reference: pi.id,
        note: `auto-refund: payment succeeded after booking was ${booking.status}`,
      });
    } catch (e: unknown) {
      // Unique violation on (stripe_reference, type) means refund already logged.
      // This is genuine idempotency, not a silent failure.
      if (isPgErrorCode(e, "23505")) return;
      throw e;
    }
    return;
  }

  // Normal path: reserved → confirmed
  await db.transaction(async (tx) => {
    await tx.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, bookingId));

    await tx.insert(ledgerEntries).values({
      booking_id: bookingId,
      type: "charge",
      amount_cents: booking.price_cents,
      stripe_reference: pi.id,
    });

    await tx.insert(ledgerEntries).values({
      booking_id: bookingId,
      type: "platform_fee",
      amount_cents: booking.platform_fee_cents,
      stripe_reference: pi.id,
    });
  });

  // Fire Inngest event for async side effects (room creation, reminders)
  try {
    await inngest.send({
      name: "booking/confirmed",
      data: { bookingId },
    });
  } catch (e) {
    // TODO (pre-launch): add real monitoring/alerting here.
    // A production Inngest outage silently blocks room creation + reminders.
    console.error(
      `[stripe] CRITICAL: Inngest send failed for booking ${bookingId}. ` +
      `Room creation and reminders will not fire. Error: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

async function handlePaymentIntentFailed(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const bookingId = pi.metadata?.booking_id;
  if (!bookingId) return;

  await db
    .update(bookings)
    .set({ status: "expired" })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "reserved")));
}

async function handlePaymentIntentCanceled(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const bookingId = pi.metadata?.booking_id;
  if (!bookingId) return;

  await db
    .update(bookings)
    .set({ status: "expired" })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "reserved")));
}
