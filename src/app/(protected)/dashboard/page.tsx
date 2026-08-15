import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { bookings as bookingsTable, offerings, creatorProfiles, users } from "@/db/schema";
import { eq, and, or, gte, inArray, desc, sql, gt } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { statusLabel } from "@/lib/status";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_creator")
    .eq("id", user.id)
    .single();

  const isCreator = profile?.is_creator ?? false;

  // Upcoming sessions the logged-in user BOOKED AS A FAN (outgoing).
  // Creator-incoming sessions live under Creator Studio → Bookings.
  const upcoming = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      start_at: bookingsTable.start_at,
      end_at: bookingsTable.end_at,
      price_cents: bookingsTable.price_cents,
      role: sql<"fan">`'fan'`,
      other_name: users.display_name,
      offering_title: offerings.title,
    })
    .from(bookingsTable)
    .innerJoin(offerings, eq(offerings.id, bookingsTable.offering_id))
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookingsTable.creator_id))
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(
      and(
        eq(bookingsTable.fan_id, user.id),
        // Live, in-progress sessions stay visible until they END — not just
        // until they START (a start_at cutoff made them vanish mid-session).
        gte(bookingsTable.end_at, new Date()),
        or(
          eq(bookingsTable.status, "confirmed"),
          and(
            eq(bookingsTable.status, "reserved"),
            gt(bookingsTable.reservation_expires_at, sql`NOW()`),
          ),
        ),
      ),
    )
    .orderBy(desc(bookingsTable.start_at))
    .limit(20);

  function statusBadge(status: string) {
    const variant =
      status === "confirmed" ? "confirmed" as const :
      status === "reserved" ? "pending" as const :
      "cancelled" as const;
    return <Badge variant={variant} label={statusLabel(status)} />;
  }

  return (
    <div className="max-w-[900px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      {/* Role-based card */}
      {isCreator ? (
        <Card className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">Creator Studio</p>
              <p className="text-sm text-text-secondary mt-1">
                Manage your profile, offerings, and availability
              </p>
            </div>
            <ButtonLink href="/creator/profile" size="small">
              Open Studio
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <Card className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">Become a Creator</p>
              <p className="text-sm text-text-secondary mt-1">
                Share your talent, set your schedule, and earn money
              </p>
            </div>
            <ButtonLink href="/creator/profile" size="small">
              Get started
            </ButtonLink>
          </div>
        </Card>
      )}

      {/* Upcoming sessions */}
      <h2 className="text-lg font-semibold text-white mb-4">
        Upcoming sessions
      </h2>

      {upcoming.length === 0 ? (
        <p className="text-text-secondary text-sm">
          No upcoming sessions —{" "}
          <Link href="/" className="text-accent hover:text-accent-hover underline">
            browse creators
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {upcoming.map((s) => (
            <Link key={s.id} href={`/bookings/${s.id}`}>
              <Card hover className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-secondary">
                      With
                    </span>
                    <span className="text-white font-medium">
                      {s.other_name}
                    </span>
                    {statusBadge(s.status)}
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    {s.offering_title} ·{" "}
                    {s.start_at
                      ? new Date(s.start_at).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </p>
                </div>
                <span className="text-sm text-text-secondary">
                  ${((s.price_cents ?? 0) / 100).toFixed(2)}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
