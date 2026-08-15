import { db } from "@/db";
import { bookings, offerings, creatorProfiles, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { BookingsTable } from "../BookingsTable";

const fanUser = alias(users, "fanUser");
const creatorUser = alias(users, "creatorUser");

export default async function AdminBookingsPage() {
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

  return <BookingsTable rows={data} />;
}
