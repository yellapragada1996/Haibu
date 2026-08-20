import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings as bookingsTable, offerings, creatorProfiles, users } from "@/db/schema";
import { eq, and, or, gte, desc } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { statusLabel } from "@/lib/status";

function badgeFor(status: string): "live" | "confirmed" | "pending" | "cancelled" | "completed" {
  switch (status) {
    case "reserved":
      return "pending";
    case "confirmed":
      return "confirmed";
    case "completed":
      return "completed";
    default:
      return "cancelled";
  }
}

function fmtDate(d: Date, timezone?: string | null) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (timezone) opts.timeZone = timezone;
  return d.toLocaleDateString("en-US", opts);
}
function fmtTime(d: Date, timezone?: string | null) {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (timezone) opts.timeZone = timezone;
  return d.toLocaleTimeString("en-US", opts);
}

export default async function CreatorBookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select({ id: creatorProfiles.id, timezone: users.timezone })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(eq(creatorProfiles.user_id, user.id));
  if (!profile) {
    return (
      <p className="text-sm text-text-secondary">
        Create your profile first before viewing bookings.
      </p>
    );
  }

  // Upcoming (confirmed/reserved) sessions.
  const incoming = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      start_at: bookingsTable.start_at,
      end_at: bookingsTable.end_at,
      price_cents: bookingsTable.price_cents,
      fan_name: users.display_name,
      offering_title: offerings.title,
    })
    .from(bookingsTable)
    .innerJoin(offerings, eq(offerings.id, bookingsTable.offering_id))
    .innerJoin(users, eq(users.id, bookingsTable.fan_id))
    .where(
      and(
        eq(bookingsTable.creator_id, profile.id),
        gte(bookingsTable.end_at, new Date()),
        or(
          eq(bookingsTable.status, "confirmed"),
          eq(bookingsTable.status, "reserved"),
        ),
      ),
    )
    .orderBy(desc(bookingsTable.start_at))
    .limit(50);

  // Completed sessions.
  const past = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      start_at: bookingsTable.start_at,
      end_at: bookingsTable.end_at,
      price_cents: bookingsTable.price_cents,
      fan_name: users.display_name,
      offering_title: offerings.title,
    })
    .from(bookingsTable)
    .innerJoin(offerings, eq(offerings.id, bookingsTable.offering_id))
    .innerJoin(users, eq(users.id, bookingsTable.fan_id))
    .where(
      and(
        eq(bookingsTable.creator_id, profile.id),
        eq(bookingsTable.status, "completed"),
      ),
    )
    .orderBy(desc(bookingsTable.start_at))
    .limit(100);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Booked by guests</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Upcoming</h2>
        {incoming.length === 0 ? (
          <p className="text-sm text-text-secondary">No upcoming bookings with guests yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {incoming.map((b) => (
              <Link key={b.id} href={`/bookings/${b.id}`}>
                <Card hover className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-secondary">Guest</span>
                      <span className="font-medium text-white">{b.fan_name}</span>
                      <Badge variant={badgeFor(b.status)} label={statusLabel(b.status)} />
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {b.offering_title} ·{" "}
                      {b.start_at
                        ? `${fmtDate(new Date(b.start_at), profile.timezone)} · ${fmtTime(new Date(b.start_at), profile.timezone)}`
                        : ""}
                    </p>
                  </div>
                  <span className="text-sm text-text-secondary">
                    ${((b.price_cents ?? 0) / 100).toFixed(2)}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Past sessions</h2>
        {past.length === 0 ? (
          <p className="text-sm text-text-secondary">No completed sessions yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {past.map((b) => (
              <Card key={b.id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-secondary">Guest</span>
                    <span className="font-medium text-white">{b.fan_name}</span>
                    <Badge variant="completed" label="Completed" />
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    {b.offering_title} ·{" "}
                    {b.start_at ? `${fmtDate(new Date(b.start_at), profile.timezone)} · ${fmtTime(new Date(b.start_at), profile.timezone)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-text-secondary">
                  ${((b.price_cents ?? 0) / 100).toFixed(2)}
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
