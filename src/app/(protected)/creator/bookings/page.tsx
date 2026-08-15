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

export default async function CreatorBookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));
  if (!profile) {
    return (
      <p className="text-sm text-text-secondary">
        Create your profile first before viewing bookings.
      </p>
    );
  }

  // Sessions where the logged-in user is the CREATOR (incoming), up to and
  // including live ones — end_at cutoff, same rule as the fan dashboard.
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

  return (
    <div>
      {incoming.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No upcoming bookings with fans yet.
        </p>
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
                      ? new Date(b.start_at).toLocaleDateString("en-US", {
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
                  ${((b.price_cents ?? 0) / 100).toFixed(2)}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
