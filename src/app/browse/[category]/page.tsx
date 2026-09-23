import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { CatalogView } from "@/components/catalog/CatalogView";
import { db } from "@/db";
import { creatorProfiles, users, offerings } from "@/db/schema";
import { eq, and, asc, isNull, sql, inArray } from "drizzle-orm";
import { getCategories, categoriesToLabelMap } from "@/lib/categories";
import { getAvailableTodayCreatorIds } from "@/lib/availability";
import onAir from "@/app/on-air.module.css";


export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ available?: string }>;
}) {
  const { category } = await params;
  const categories = await getCategories();
  const categoryLabels = categoriesToLabelMap(categories);
  const current = categories.find((c) => c.slug === category);
  if (!current) notFound();

  const label = current.display_label;

  // Category membership is determined by active OFFERINGS in that category,
  // not the creator_profiles.category field — a creator with an active
  // offering in a category appears there.
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
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .innerJoin(offerings, eq(offerings.creator_id, creatorProfiles.id))
    .where(
      and(
        eq(creatorProfiles.is_published, true),
        eq(offerings.category, category),
        eq(offerings.is_active, true),
        isNull(offerings.deleted_at),
      ),
    )
    .orderBy(asc(offerings.price_cents));

  // One record per creator with full distinct category list.
  const map = new Map<
    string,
    (typeof rows)[0] & { categories: string[]; offeringIds: string[] }
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
  let creators = Array.from(map.values());

  // Attach each creator's FULL category list. The query above is filtered to
  // this category, so its `categories` only contains the selected category —
  // re-fetch all active offering categories so cards show every pill.
  const creatorIds = creators.map((c) => c.id);
  if (creatorIds.length > 0) {
    const catRows = await db
      .select({ creator_id: offerings.creator_id, slug: offerings.category })
      .from(offerings)
      .where(
        and(
          inArray(offerings.creator_id, creatorIds),
          eq(offerings.is_active, true),
          isNull(offerings.deleted_at),
        ),
      );
    const byId = new Map<string, string[]>();
    for (const r of catRows) {
      const arr = byId.get(r.creator_id) ?? [];
      if (!arr.includes(r.slug)) arr.push(r.slug);
      byId.set(r.creator_id, arr);
    }
    creators = creators.map((c) => ({
      ...c,
      categories: byId.get(c.id) ?? c.categories,
    }));
  }

  // Preserve the "available today" context when navigating between pills.
  const { available } = await searchParams;
  let pillCategories = categories;
  const onlyAvailableToday = available === "today";
  if (onlyAvailableToday) {
    const ids = await getAvailableTodayCreatorIds();
    creators = creators.filter((c) => ids.has(c.id));
    // Pills = categories of ALL available-today creators (across every
    // category), so filtering by a pill never makes the other pills vanish.
    const catRows = await db
      .select({ slug: offerings.category })
      .from(offerings)
      .where(
        and(
          inArray(offerings.creator_id, [...ids]),
          eq(offerings.is_active, true),
          isNull(offerings.deleted_at),
        ),
      );
    const catSet = new Set(catRows.map((r) => r.slug));
    pillCategories = categories.filter((c) => catSet.has(c.slug));
  }

  return (
    <PublicLayout className={onAir.root} translucentNav>
      <CatalogView
        kicker={onlyAvailableToday ? "Available today" : "Category"}
        live={onlyAvailableToday}
        title={<em>{label}</em>}
        pills={[
          {
            key: "all",
            label: "All",
            href: onlyAvailableToday ? "/browse?available=today" : "/browse",
            active: false,
          },
          ...pillCategories.map((c) => ({
            key: c.slug,
            label: c.display_label,
            href: onlyAvailableToday ? `/browse/${c.slug}?available=today` : `/browse/${c.slug}`,
            active: c.slug === category,
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
        priorityCategory={category}
        emptyText={
          onlyAvailableToday
            ? `No one in ${label} has open slots for the rest of today.`
            : `No one in ${label} yet. Check back soon.`
        }
        emptyCta={
          onlyAvailableToday
            ? { label: `See all ${label} creators`, href: `/browse/${category}` }
            : { label: "Become a creator", href: "/creator" }
        }
      />
    </PublicLayout>
  );
}
