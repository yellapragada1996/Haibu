import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  bookings as bookingsTable,
  offerings,
  creatorProfiles,
  users,
  reviews,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { SessionList, type SessionItem } from "./SessionList";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_creator, timezone")
    .eq("id", user.id)
    .single();

  const isCreator = profile?.is_creator ?? false;
  const timezone = profile?.timezone ?? null;

  // All guest bookings, newest first, with the guest's review (if any).
  const rows = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      start_at: bookingsTable.start_at,
      end_at: bookingsTable.end_at,
      reservation_expires_at: bookingsTable.reservation_expires_at,
      price_cents: bookingsTable.price_cents,
      creator_profile_id: creatorProfiles.id,
      creator_name: users.display_name,
      creator_avatar: users.avatar_url,
      offering_title: offerings.title,
      duration_minutes: offerings.duration_minutes,
      category: offerings.category,
      review_id: reviews.id,
      review_rating: reviews.rating,
      review_text: reviews.text,
      review_tags: reviews.tags,
    })
    .from(bookingsTable)
    .innerJoin(offerings, eq(offerings.id, bookingsTable.offering_id))
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookingsTable.creator_id))
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .leftJoin(
      reviews,
      and(
        eq(reviews.booking_id, bookingsTable.id),
        eq(reviews.reviewer_role, "guest"),
      ),
    )
    .where(eq(bookingsTable.fan_id, user.id))
    .orderBy(desc(bookingsTable.start_at))
    .limit(200);

  const now = new Date();
  const upcoming: SessionItem[] = [];
  const past: SessionItem[] = [];

  for (const r of rows) {
    const isActiveUpcoming =
      r.end_at != null &&
      r.end_at >= now &&
      (r.status === "confirmed" ||
        (r.status === "reserved" &&
          r.reservation_expires_at != null &&
          r.reservation_expires_at > now));

    const item: SessionItem = {
      id: r.id,
      status: r.status,
      start_at: r.start_at ? r.start_at.toISOString() : "",
      end_at: r.end_at ? r.end_at.toISOString() : "",
      price_cents: r.price_cents,
      creator_profile_id: r.creator_profile_id,
      creator_name: r.creator_name,
      creator_avatar: r.creator_avatar,
      offering_title: r.offering_title,
      duration_minutes: r.duration_minutes,
      category: r.category,
      review: r.review_id
        ? {
            rating: r.review_rating ?? 0,
            text: r.review_text ?? null,
            tags: r.review_tags ?? [],
          }
        : null,
    };

    if (isActiveUpcoming) upcoming.push(item);
    else past.push(item);
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

      <SessionList upcoming={upcoming} past={past} timezone={timezone} />
    </div>
  );
}
