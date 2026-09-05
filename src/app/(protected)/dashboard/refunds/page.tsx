import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  bookings,
  ledgerEntries,
  offerings,
  creatorProfiles,
  users,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { RefundList, type RefundItem } from "./RefundList";

export default async function RefundsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [me] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, user.id));

  const rows = await db
    .select({
      ledger_id: ledgerEntries.id,
      refund_cents: ledgerEntries.amount_cents,
      refund_note: ledgerEntries.note,
      refunded_at: ledgerEntries.created_at,
      booking_id: bookings.id,
      price_cents: bookings.price_cents,
      stripe_fee_cents: bookings.stripe_fee_cents,
      status: bookings.status,
      cancelled_by: bookings.cancelled_by,
      cancel_reason: bookings.cancel_reason,
      start_at: bookings.start_at,
      offering_title: offerings.title,
      creator_name: users.display_name,
      creator_avatar: users.avatar_url,
    })
    .from(ledgerEntries)
    .innerJoin(bookings, eq(bookings.id, ledgerEntries.booking_id))
    .innerJoin(offerings, eq(offerings.id, bookings.offering_id))
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(
      and(
        eq(bookings.fan_id, user.id),
        eq(ledgerEntries.type, "refund"),
      ),
    )
    .orderBy(desc(ledgerEntries.created_at))
    .limit(200);

  const items: RefundItem[] = rows.map((r) => ({
    id: r.ledger_id,
    bookingId: r.booking_id,
    refundCents: Math.abs(r.refund_cents),
    priceCents: r.price_cents,
    stripeFeeCents: r.stripe_fee_cents ?? 0,
    refundedAt: r.refunded_at.toISOString(),
    startAt: r.start_at ? r.start_at.toISOString() : "",
    offeringTitle: r.offering_title,
    creatorName: r.creator_name,
    creatorAvatar: r.creator_avatar,
    status: r.status,
    cancelledBy: r.cancelled_by ?? null,
    cancelReason: r.cancel_reason ?? null,
    note: r.refund_note ?? null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">Refunds</h1>
      <div className="mt-6">
        <RefundList items={items} timezone={me?.timezone ?? null} />
      </div>
    </div>
  );
}
