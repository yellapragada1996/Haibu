import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  bookings,
  offerings,
  creatorProfiles,
  users,
  reviews,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { REVIEW_WINDOW_MS } from "@/lib/review-tags";

function sessionBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "completed":
      return { label: "Completed", className: "border border-white text-white" };
    case "confirmed":
    case "reserved":
      return { label: "Upcoming", className: "border border-live-green text-live-green" };
    case "expired":
      return { label: "Expired", className: "border border-text-tertiary text-text-tertiary" };
    default:
      return { label: "Cancelled", className: "border border-text-tertiary text-text-tertiary" };
  }
}

function sessionTime(start: Date | null, end: Date | null): string {
  if (!start || !end) return "—";
  const date = start.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const s = start.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  const e = end.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${s} – ${e}`;
}

export default async function GuestSessionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      start_at: bookings.start_at,
      end_at: bookings.end_at,
      price_cents: bookings.price_cents,
      creator_profile_id: creatorProfiles.id,
      creator_name: users.display_name,
      creator_avatar: users.avatar_url,
      offering_title: offerings.title,
      duration_minutes: offerings.duration_minutes,
      reviewed: reviews.id,
    })
    .from(bookings)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .innerJoin(offerings, eq(offerings.id, bookings.offering_id))
    .leftJoin(
      reviews,
      and(
        eq(reviews.booking_id, bookings.id),
        eq(reviews.reviewer_role, "guest"),
      ),
    )
    .where(eq(bookings.fan_id, user.id))
    .orderBy(desc(bookings.start_at))
    .limit(200);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-white">My sessions</h1>

      {rows.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-sm text-text-secondary">
            No sessions yet — browse creators.
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm font-medium text-accent hover:text-accent-hover"
          >
            Browse creators
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {rows.map((b) => {
            const badge = sessionBadge(b.status);
            const completed = b.status === "completed";
            const withinWindow =
              b.end_at != null &&
              Date.now() <= new Date(b.end_at).getTime() + REVIEW_WINDOW_MS;

            return (
              <Card key={b.id} className="flex items-center gap-4">
                <Avatar src={b.creator_avatar} name={b.creator_name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-white">
                      {b.creator_name}
                    </span>
                    <span
                      className={`rounded-pill px-2 py-0.5 text-xs ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-text-secondary">
                    {b.offering_title} · {b.duration_minutes} min
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {sessionTime(b.start_at, b.end_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-sm text-text-secondary">
                    ${((b.price_cents ?? 0) / 100).toFixed(2)}
                  </span>
                  {completed &&
                    (b.reviewed ? (
                      <span className="text-xs font-medium text-live-green">
                        Reviewed ✓
                      </span>
                    ) : withinWindow ? (
                      <Link
                        href={`/bookings/${b.id}`}
                        className="rounded-pill bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover"
                      >
                        Review
                      </Link>
                    ) : (
                      <span className="text-xs text-text-tertiary">
                        Review period expired
                      </span>
                    ))}
                  {completed && (
                    <Link
                      href={`/creators/${b.creator_profile_id}`}
                      className="text-xs text-text-secondary hover:text-white"
                    >
                      Book again
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
