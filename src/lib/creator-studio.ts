import { db } from "@/db";
import {
  availabilityWindows,
  bookings,
  ledgerEntries,
  offerings,
  platformSettings,
  users,
} from "@/db/schema";
import { and, count, desc, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const fan = alias(users, "fan");

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export type EarningsSession = {
  id: string;
  startAt: Date | null;
  endAt: Date | null;
  offering: string;
  guest: string;
  duration: number | null;
  amount: number;
  status: "paid" | "pending" | "on_hold";
  paysAt: Date | null;
  priceCents: number;
  stripeFeeCents: number;
  platformFeeCents: number;
  creatorPayoutCents: number;
  effectivePayoutCents: number | null;
  bookingStatus: string;
  fanJoined: boolean;
  creatorJoined: boolean;
  cancelledBy: string | null;
  cancelReason: string | null;
};

export async function getCreatorEarnings(profileId: string) {
  // "Done" = sessions the creator actually earned money for. Guest cancellations
  // are included because cancel.ts stores the creator's non-refunded share in
  // effective_payout_cents and the sweep pays it out (policy §3).
  const doneStatuses = sql`${bookings.status} IN ('completed', 'no_show_fan', 'cancelled_fan')`;

  const [earnedRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(COALESCE(${bookings.effective_payout_cents}, ${bookings.creator_payout_cents})), 0)`,
    })
    .from(bookings)
    .where(and(eq(bookings.creator_id, profileId), doneStatuses));

  const [paidRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(ABS(${ledgerEntries.amount_cents})), 0)`,
    })
    .from(ledgerEntries)
    .innerJoin(bookings, eq(bookings.id, ledgerEntries.booking_id))
    .where(
      and(
        eq(bookings.creator_id, profileId),
        eq(ledgerEntries.type, "creator_payout"),
        doneStatuses,
      ),
    );

  const total = Number(earnedRow?.total ?? 0);
  const paid = Number(paidRow?.total ?? 0);

  const rows = await db
    .select({
      id: bookings.id,
      start_at: bookings.start_at,
      end_at: bookings.end_at,
      offering: offerings.title,
      guest: fan.display_name,
      duration: offerings.duration_minutes,
      effective: sql<number>`COALESCE(${bookings.effective_payout_cents}, ${bookings.creator_payout_cents})`,
      needs_review: bookings.needs_review,
      payout_eligible_at: bookings.payout_eligible_at,
      price_cents: bookings.price_cents,
      stripe_fee_cents: bookings.stripe_fee_cents,
      platform_fee_cents: bookings.platform_fee_cents,
      creator_payout_cents: bookings.creator_payout_cents,
      effective_payout_cents: bookings.effective_payout_cents,
      booking_status: bookings.status,
      fan_joined_at: bookings.fan_joined_at,
      creator_joined_at: bookings.creator_joined_at,
      cancelled_by: bookings.cancelled_by,
      cancel_reason: bookings.cancel_reason,
    })
    .from(bookings)
    .innerJoin(offerings, eq(offerings.id, bookings.offering_id))
    .innerJoin(fan, eq(fan.id, bookings.fan_id))
    .where(and(eq(bookings.creator_id, profileId), doneStatuses))
    .orderBy(desc(bookings.start_at));

  const paidIds = new Set<string>();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const led = await db
      .select({ booking_id: ledgerEntries.booking_id })
      .from(ledgerEntries)
      .where(
        and(
          inArray(ledgerEntries.booking_id, ids),
          eq(ledgerEntries.type, "creator_payout"),
        ),
      );
    for (const l of led) if (l.booking_id) paidIds.add(l.booking_id);
  }

  const sessions: EarningsSession[] = rows.map((r) => {
    const status = r.needs_review
      ? "on_hold"
      : paidIds.has(r.id)
        ? "paid"
        : "pending";
    return {
      id: r.id,
      startAt: r.start_at,
      endAt: r.end_at,
      offering: r.offering,
      guest: r.guest,
      duration: r.duration,
      amount: r.effective,
      status,
      paysAt: r.payout_eligible_at,
      priceCents: r.price_cents,
      stripeFeeCents: r.stripe_fee_cents ?? 0,
      platformFeeCents: r.platform_fee_cents,
      creatorPayoutCents: r.creator_payout_cents,
      effectivePayoutCents: r.effective_payout_cents,
      bookingStatus: r.booking_status,
      fanJoined: r.fan_joined_at !== null,
      creatorJoined: r.creator_joined_at !== null,
      cancelledBy: r.cancelled_by ?? null,
      cancelReason: r.cancel_reason ?? null,
    };
  });

  const [feeRow] = await db
    .select({ rate: platformSettings.platform_fee_rate })
    .from(platformSettings)
    .limit(1);
  const platformFeeRate = feeRow?.rate ?? 0.18;

  return {
    totalEarned: total,
    paidOut: paid,
    pending: total - paid,
    sessions,
    platformFeeRate,
  };
}

export async function getCreatorUpcoming(profileId: string, limit = 3) {
  return db
    .select({
      id: bookings.id,
      start_at: bookings.start_at,
      end_at: bookings.end_at,
      offering: offerings.title,
      guest: fan.display_name,
      duration: offerings.duration_minutes,
    })
    .from(bookings)
    .innerJoin(offerings, eq(offerings.id, bookings.offering_id))
    .innerJoin(fan, eq(fan.id, bookings.fan_id))
    .where(
      and(
        eq(bookings.creator_id, profileId),
        gte(bookings.end_at, sql`NOW()`),
        or(eq(bookings.status, "confirmed"), eq(bookings.status, "reserved")),
      ),
    )
    .orderBy(desc(bookings.start_at))
    .limit(limit);
}

export async function getCreatorWeekOpen(profileId: string): Promise<boolean[]> {
  const windows = await db
    .select({ day: availabilityWindows.day_of_week })
    .from(availabilityWindows)
    .where(eq(availabilityWindows.creator_id, profileId));
  const open = new Set(windows.map((w) => w.day));
  return [0, 1, 2, 3, 4, 5, 6].map((d) => open.has(d));
}

export async function getCreatorAttention(
  profileId: string,
  profile: {
    stripeOnboardingComplete: boolean;
    identityVerified: boolean;
    isPublished: boolean;
  },
) {
  const [offeringsCount] = await db
    .select({ n: count() })
    .from(offerings)
    .where(
      and(
        eq(offerings.creator_id, profileId),
        eq(offerings.is_active, true),
        isNull(offerings.deleted_at),
      ),
    );

  const [windowsCount] = await db
    .select({ n: count() })
    .from(availabilityWindows)
    .where(eq(availabilityWindows.creator_id, profileId));

  return {
    onboarding: {
      offeringsDone: Number(offeringsCount?.n ?? 0) > 0,
      availabilityDone: Number(windowsCount?.n ?? 0) > 0,
      paymentsDone: profile.stripeOnboardingComplete,
      identityDone: profile.identityVerified,
      published: profile.isPublished,
    },
  };
}
