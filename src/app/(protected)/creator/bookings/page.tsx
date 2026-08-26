import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings as bookingsTable, offerings, creatorProfiles, users } from "@/db/schema";
import { eq, and, or, gte, desc, sql } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { bookingBadgeVariant, bookingLabel } from "@/lib/status";

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

type CancelledRowItem = {
  id: string;
  status: string;
  cancelled_by: string | null;
  needs_review: boolean | null;
  start_at: Date | null;
  end_at: Date | null;
  price_cents: number | null;
  fan_name: string;
  offering_title: string;
};

function CancelledRow({ b, timezone }: { b: CancelledRowItem; timezone?: string | null }) {
  return (
    <Link href={`/bookings/${b.id}`}>
      <Card hover className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Guest</span>
            <span className="font-medium text-white">{b.fan_name}</span>
            <Badge
              variant={bookingBadgeVariant(b.status)}
              label={bookingLabel(
                b.status,
                { cancelled_by: b.cancelled_by, needs_review: b.needs_review },
                "creator",
              )}
            />
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {b.offering_title} ·{" "}
            {b.start_at
              ? `${fmtDate(new Date(b.start_at), timezone)} · ${fmtTime(new Date(b.start_at), timezone)} – ${b.end_at ? fmtTime(new Date(b.end_at), timezone) : ""}`
              : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm text-text-secondary">
          ${((b.price_cents ?? 0) / 100).toFixed(2)}
        </span>
      </Card>
    </Link>
  );
}

function CancelledSection({
  title,
  rows,
  timezone,
}: {
  title: string;
  rows: CancelledRowItem[];
  timezone?: string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold text-white">{title}</h2>
      <div className="flex flex-col gap-3">
        {rows.map((b) => (
          <CancelledRow key={b.id} b={b} timezone={timezone} />
        ))}
      </div>
    </section>
  );
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

  // Past sessions — completed + any confirmed booking past its end time
  // (stuck "confirmed" means evaluation hasn't run yet).
  const past = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      start_at: bookingsTable.start_at,
      end_at: bookingsTable.end_at,
      price_cents: bookingsTable.price_cents,
      fan_name: users.display_name,
      offering_title: offerings.title,
      needs_review: bookingsTable.needs_review,
    })
    .from(bookingsTable)
    .innerJoin(offerings, eq(offerings.id, bookingsTable.offering_id))
    .innerJoin(users, eq(users.id, bookingsTable.fan_id))
    .where(
      and(
        eq(bookingsTable.creator_id, profile.id),
        or(
          eq(bookingsTable.status, "completed"),
          and(
            eq(bookingsTable.status, "confirmed"),
            sql`${bookingsTable.end_at} < NOW()`,
          ),
        ),
      ),
    )
    .orderBy(desc(bookingsTable.start_at))
    .limit(100);

  // Cancelled + no-show sessions, split into sections below by status/cancelled_by.
  const cancelled = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      cancelled_by: bookingsTable.cancelled_by,
      needs_review: bookingsTable.needs_review,
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
        sql`${bookingsTable.status} IN ('cancelled_fan','cancelled_creator','cancelled_admin','no_show_fan','no_show_creator')`,
      ),
    )
    .orderBy(desc(bookingsTable.start_at))
    .limit(200);

  const cancelledByGuests = cancelled.filter((b) => b.status === "cancelled_fan");
  const cancelledByCreator = cancelled.filter(
    (b) => b.status === "cancelled_creator" && b.cancelled_by === "creator",
  );
  const cancelledByAdmin = cancelled.filter((b) => b.status === "cancelled_admin");
  const noShows = cancelled.filter(
    (b) =>
      b.status === "no_show_fan" ||
      b.status === "no_show_creator" ||
      (b.status === "cancelled_creator" && b.cancelled_by === "system"),
  );

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
                      <Badge variant={bookingBadgeVariant(b.status)} label={bookingLabel(b.status, {}, "creator")} />
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {b.offering_title} ·{" "}
                      {b.start_at
                        ? `${fmtDate(new Date(b.start_at), profile.timezone)} · ${fmtTime(new Date(b.start_at), profile.timezone)} – ${b.end_at ? fmtTime(new Date(b.end_at), profile.timezone) : ""}`
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
        <h2 className="mb-3 text-lg font-semibold text-white">Completed</h2>
        {past.length === 0 ? (
          <p className="text-sm text-text-secondary">No completed sessions yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {past.map((b) => (
              <Link key={b.id} href={`/bookings/${b.id}`}>
                <Card hover className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-secondary">Guest</span>
                      <span className="font-medium text-white">{b.fan_name}</span>
                      <Badge
                        variant={bookingBadgeVariant(b.status)}
                        label={bookingLabel(b.status, { needs_review: b.needs_review }, "creator")}
                      />
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {b.offering_title} ·{" "}
                      {b.start_at
                        ? `${fmtDate(new Date(b.start_at), profile.timezone)} · ${fmtTime(new Date(b.start_at), profile.timezone)} – ${b.end_at ? fmtTime(new Date(b.end_at), profile.timezone) : ""}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-text-secondary">
                    ${((b.price_cents ?? 0) / 100).toFixed(2)}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <CancelledSection
        title="Cancelled by guests"
        rows={cancelledByGuests}
        timezone={profile.timezone}
      />
      <CancelledSection
        title="Cancelled by you"
        rows={cancelledByCreator}
        timezone={profile.timezone}
      />
      <CancelledSection
        title="Cancelled by Haibu"
        rows={cancelledByAdmin}
        timezone={profile.timezone}
      />
      <CancelledSection
        title="No-shows"
        rows={noShows}
        timezone={profile.timezone}
      />
    </div>
  );
}
