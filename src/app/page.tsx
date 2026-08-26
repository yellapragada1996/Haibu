import { PublicLayout } from "@/components/layout/PublicLayout";
import { db } from "@/db";
import {
  creatorProfiles,
  users,
  offerings,
} from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getCategories, categoriesToLabelMap } from "@/lib/categories";
import { getAvailableTodayCreatorIds } from "@/lib/availability";
import { HomeContent, type HomeCreator } from "./HomeContent";

export const dynamic = "force-dynamic";

async function getCreatorsWithOfferings() {
  const rows = await db
    .select({
      id: creatorProfiles.id,
      slug: creatorProfiles.slug,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
      offering_category: offerings.category,
      offering_price: offerings.price_cents,
      offering_duration: offerings.duration_minutes,
      offering_id: offerings.id,
      rating: sql<number>`COALESCE((SELECT AVG(r.rating)::float FROM reviews r WHERE r.creator_id = creator_profiles.id AND r.is_public = true), 0)`,
      reviewCount: sql<number>`(SELECT COUNT(*) FROM reviews r WHERE r.creator_id = creator_profiles.id AND r.is_public = true)`,
      sessionCount: sql<number>`(SELECT COUNT(*) FROM bookings b WHERE b.creator_id = creator_profiles.id AND b.status = 'completed')`,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .innerJoin(offerings, eq(offerings.creator_id, creatorProfiles.id))
    .where(
      and(
        eq(creatorProfiles.is_published, true),
        eq(offerings.is_active, true),
        isNull(offerings.deleted_at),
      ),
    );

  const map = new Map<
    string,
    typeof rows[0] & { categories: string[]; offeringIds: string[] }
  >();
  for (const r of rows) {
    const existing = map.get(r.id);
    if (existing) {
      if (!existing.categories.includes(r.offering_category)) {
        existing.categories.push(r.offering_category);
      }
      if (!existing.offeringIds.includes(r.offering_id)) {
        existing.offeringIds.push(r.offering_id);
      }
    } else {
      map.set(r.id, {
        ...r,
        categories: [r.offering_category],
        offeringIds: [r.offering_id],
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      b.rating - a.rating ||
      b.sessionCount - a.sessionCount ||
      a.offering_price - b.offering_price,
  );
}

export default async function HomePage() {
  const creators = await getCreatorsWithOfferings();
  const availableTodayIds = await getAvailableTodayCreatorIds();
  const availableToday = creators.filter((c) => availableTodayIds.has(c.id));
  const categories = await getCategories();
  const categoryLabels = categoriesToLabelMap(categories);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAnon = !user;

  const toClient = (c: (typeof creators)[number]): HomeCreator => ({
    id: c.id,
    slug: c.slug,
    display_name: c.display_name,
    avatar_url: c.avatar_url,
    categories: c.categories,
    offering_price: c.offering_price,
    rating: c.rating,
  });

  return (
    <PublicLayout>
      <HomeContent
        creators={creators.map(toClient)}
        availableToday={availableToday.map(toClient)}
        categories={categories.map((c) => ({
          slug: c.slug,
          display_label: c.display_label,
        }))}
        categoryLabels={categoryLabels}
        isAnon={isAnon}
      />
    </PublicLayout>
  );
}
