import { db } from "@/db";
import { offerings, creatorProfiles, bookings } from "@/db/schema";
import { eq, and, count, isNull } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/categories";
import { OfferingsList } from "./OfferingsList";

export default async function CreatorOfferingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await db
    .select({ id: creatorProfiles.id, category: creatorProfiles.category })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));

  if (!profile) {
    return (
      <p className="text-text-secondary">
        Create your profile first before adding offerings.
      </p>
    );
  }

  const list = await db
    .select({
      id: offerings.id,
      title: offerings.title,
      category: offerings.category,
      duration_minutes: offerings.duration_minutes,
      price_cents: offerings.price_cents,
      is_active: offerings.is_active,
      booking_count: count(bookings.id),
    })
    .from(offerings)
    .leftJoin(bookings, eq(bookings.offering_id, offerings.id))
    .where(
      and(
        eq(offerings.creator_id, profile.id),
        // Soft-deleted offerings (deleted_at set) are permanently invisible
        // to the creator — row persists only for past-booking display.
        isNull(offerings.deleted_at),
      ),
    )
    .groupBy(offerings.id)
    .orderBy(offerings.created_at);

  const categories = await getCategories();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Offerings</h1>
      <div className="mt-6">
        <OfferingsList
          offerings={list.map((o) => ({
            ...o,
            booking_count: Number(o.booking_count),
          }))}
          profileId={profile.id}
          profileCategory={profile.category}
          categories={categories.map((c) => ({
            value: c.slug,
            label: c.display_label,
          }))}
        />
      </div>
    </div>
  );
}
