import { PublicLayout } from "@/components/layout/PublicLayout";
import { CatalogView } from "@/components/catalog/CatalogView";
import { db } from "@/db";
import { creatorProfiles, users, offerings } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import onAir from "@/app/on-air.module.css";
import { getCategories, categoriesToLabelMap } from "@/lib/categories";
import { getAvailableTodayCreatorIds } from "@/lib/availability";

// Reads a live DB — render on demand, never prerender at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Browse creators" };


// Full catalog — the "View more" destination for Available today + Discover.
async function getAllCreators() {
  const rows = await db
    .select({
      id: creatorProfiles.id,
      slug: creatorProfiles.slug,
      bio: creatorProfiles.bio,
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
      existing.offering_price = Math.min(existing.offering_price, r.offering_price);
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

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ available?: string }>;
}) {
  let creators = await getAllCreators();
  const { available } = await searchParams;
  const onlyAvailableToday = available === "today";
  if (onlyAvailableToday) {
    const ids = await getAvailableTodayCreatorIds();
    creators = creators.filter((c) => ids.has(c.id));
  }
  const categories = await getCategories();
  const categoryLabels = categoriesToLabelMap(categories);
  // In "available today" mode, only show pills for categories that actually
  // have available-today creators (e.g. All + ASMR + Music, no empty pills).
  const pillCategories = onlyAvailableToday
    ? categories.filter((c) => creators.some((x) => x.categories.includes(c.slug)))
    : categories;

  return (
    <PublicLayout className={onAir.root} translucentNav>
      <CatalogView
        kicker={onlyAvailableToday ? "Open for booking" : "Browse"}
        live={onlyAvailableToday}
        title={
          onlyAvailableToday ? (
            <>
              Available <em>today</em>
            </>
          ) : (
            <>
              All <em>creators</em>
            </>
          )
        }
        pills={[
          {
            key: "all",
            label: "All",
            href: onlyAvailableToday ? "/browse?available=today" : "/browse",
            active: true,
          },
          ...pillCategories.map((c) => ({
            key: c.slug,
            label: c.display_label,
            href: onlyAvailableToday ? `/browse/${c.slug}?available=today` : `/browse/${c.slug}`,
            active: false,
          })),
        ]}
        creators={creators.map((c) => ({
          id: c.id,
          slug: c.slug,
          display_name: c.display_name,
          avatar_url: c.avatar_url,
          bio: c.bio?.trim() || null,
          categories: c.categories,
          offering_price: c.offering_price,
        }))}
        labels={categoryLabels}
        emptyText={
          onlyAvailableToday
            ? "No one has open slots for the rest of today. Check back tomorrow."
            : "No creators yet. Check back soon."
        }
        emptyCta={onlyAvailableToday ? { label: "Browse all creators", href: "/browse" } : undefined}
      />
    </PublicLayout>
  );
}
