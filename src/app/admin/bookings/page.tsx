import { db } from "@/db";
import { bookings, offerings, creatorProfiles, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { BookingsTable } from "../BookingsTable";
import { FilterChips } from "../FilterChips";

const fanUser = alias(users, "fanUser");
const creatorUser = alias(users, "creatorUser");

const CANCELLED = sql`${bookings.status} IN ('expired', 'cancelled_fan', 'cancelled_creator', 'cancelled_admin', 'no_show_creator')`;

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const cond =
    status === "cancelled"
      ? CANCELLED
      : status === "confirmed"
        ? eq(bookings.status, "confirmed")
        : status === "completed"
          ? eq(bookings.status, "completed")
          : status === "reserved"
            ? eq(bookings.status, "reserved")
            : status === "no_show_fan"
              ? eq(bookings.status, "no_show_fan")
              : undefined;

  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      start_at: bookings.start_at,
      price_cents: bookings.price_cents,
      fan_name: fanUser.display_name,
      creator_name: creatorUser.display_name,
      offering_title: offerings.title,
    })
    .from(bookings)
    .innerJoin(offerings, eq(offerings.id, bookings.offering_id))
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .innerJoin(fanUser, eq(fanUser.id, bookings.fan_id))
    .innerJoin(creatorUser, eq(creatorUser.id, creatorProfiles.user_id))
    .where(cond)
    .orderBy(desc(bookings.created_at))
    .limit(200);

  const data = rows.map((r) => ({
    id: r.id,
    status: r.status,
    start_at: r.start_at ? r.start_at.toISOString() : "",
    price_cents: r.price_cents,
    fan: r.fan_name,
    creator: r.creator_name,
    offering: r.offering_title,
  }));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Bookings</h1>
      <FilterChips
        base="/admin/bookings"
        param="status"
        current={status}
        options={[
          { label: "All", value: "" },
          { label: "Confirmed", value: "confirmed" },
          { label: "Completed", value: "completed" },
          { label: "Reserved", value: "reserved" },
          { label: "No-show fan", value: "no_show_fan" },
          { label: "Cancelled", value: "cancelled" },
        ]}
      />
      <BookingsTable rows={data} />
    </div>
  );
}
