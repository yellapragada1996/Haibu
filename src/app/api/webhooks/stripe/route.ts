import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/db";
import { creatorProfiles, bookings, ledgerEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { reconcileCreatorOnboarding } from "@/lib/creator-onboarding";
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
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event);
        break;
      case "payment_intent.canceled":
        await handlePaymentIntentCanceled(event);
        break;
      case "charge.dispute.created":
      case "charge.dispute.funds_withdrawn":
        await handleChargeDispute(event);
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
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.stripe_account_id, account.id));
  if (!profile) return;

  // Reconcile both onboarding phases (business/bank + identity) from the
  // account's requirements. This is the same logic the page load uses, so
  // webhook and page never disagree.
  await reconcileCreatorOnboarding(profile.id);
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
    try {
      await stripe.refunds.create({
        payment_intent: pi.id,
        reason: "requested_by_customer" as Stripe.RefundCreateParams.Reason,
      });
    } catch (e: unknown) {
      // Charge already refunded (e.g. duplicate webhook delivery) — skip to ledger.
      if (!(e instanceof Stripe.errors.StripeInvalidRequestError && /already.*refund/i.test(e.message))) {
        throw e;
      }
    }
    try {
      await db.insert(ledgerEntries).values({
        booking_id: bookingId,
        type: "refund",
        amount_cents: -booking.price_cents,
        stripe_reference: pi.id,
        note: `auto-refund: payment succeeded after booking was ${booking.status}`,
      });
    } catch (e: unknown) {
      if (isPgErrorCode(e, "23505")) return;
      throw e;
    }
    return;
  }

  // Reconcile the actual Stripe processing fee from the Balance Transaction.
  // The booking row currently holds an estimate (computed before payment); the
  // real fee depends on card type, country, etc. and is only known after the
  // charge succeeds. If the fetch fails, we keep the estimate — an approximate
  // fee is better than blocking the confirmation.
  let actualStripeFeeCents = booking.stripe_fee_cents ?? 0;
  try {
    const expanded = await stripe.paymentIntents.retrieve(pi.id, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = expanded.latest_charge as Stripe.Charge | undefined;
    const bt =
      charge && typeof charge.balance_transaction === "object"
        ? (charge.balance_transaction as Stripe.BalanceTransaction)
        : null;
    if (bt?.fee_details) {
      const stripeFees = bt.fee_details.filter((d) => d.type === "stripe_fee");
      if (stripeFees.length > 0) {
        actualStripeFeeCents = stripeFees.reduce((s, d) => s + d.amount, 0);
      }
    }
  } catch (e) {
    console.error(
      `[stripe] failed to fetch actual fee for PI ${pi.id}, using estimate`,
      e,
    );
  }
  const actualCreatorPayoutCents =
    booking.price_cents - actualStripeFeeCents - booking.platform_fee_cents;

  // Normal path: reserved → confirmed
  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({
        status: "confirmed",
        stripe_fee_cents: actualStripeFeeCents,
        creator_payout_cents: actualCreatorPayoutCents,
      })
      .where(eq(bookings.id, bookingId));

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

// ---------------------------------------------------------------------------
// Chargeback / dispute (policy §7, §11) — a guest's bank reversed the charge.
// Cancel any pending payout and record the money movement so the ledger
// reconciles. Session status is left untouched (this is a money event).
// ---------------------------------------------------------------------------

async function handleChargeDispute(event: Stripe.Event) {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = dispute.charge as string | undefined;
  if (!chargeId) return;

  // dispute → charge → payment_intent → booking.
  let paymentIntentId: string | null = null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  } catch (e) {
    console.error(`[stripe] charge lookup failed for dispute ${dispute.id}`, e);
    return;
  }
  if (!paymentIntentId) return;

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.stripe_payment_intent_id, paymentIntentId));
  if (!booking) return;

  // Cancel the pending payout so the sweep won't release funds already clawed back.
  await db
    .update(bookings)
    .set({ payout_eligible_at: null, needs_review: false })
    .where(eq(bookings.id, booking.id));

  const amountCents = dispute.amount ?? booking.price_cents;
  try {
    await db.insert(ledgerEntries).values({
      booking_id: booking.id,
      type: "chargeback",
      amount_cents: -amountCents,
      stripe_reference: dispute.id,
      note: `chargeback: dispute ${dispute.status}`,
    });
  } catch (e: unknown) {
    if (!isPgErrorCode(e, "23505")) throw e;
  }
}
