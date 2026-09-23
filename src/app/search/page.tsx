import { PublicLayout } from "@/components/layout/PublicLayout";
import { CatalogView } from "@/components/catalog/CatalogView";
import { db } from "@/db";
import { creatorProfiles, users, offerings } from "@/db/schema";
import { eq, and, asc, isNull, sql } from "drizzle-orm";
import onAir from "@/app/on-air.module.css";

import { getCategories, categoriesToLabelMap } from "@/lib/categories";

// Reads a live DB — render on demand, never prerender at build time.
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q = "", category: categoryParam } = await searchParams;
  const activeCategory = typeof categoryParam === "string" ? categoryParam : null;

  const normalizedQuery = q.trim().replace(/\s+/g, " ");

  const categories = await getCategories();
  const categoryLabels = categoriesToLabelMap(categories);
  let pillCategories = categories;

  const rows = normalizedQuery
    ? await db
        .select({
          id: creatorProfiles.id,
          slug: creatorProfiles.slug,
          bio: creatorProfiles.bio,
          display_name: users.display_name,
          avatar_url: users.avatar_url,
          offering_category: offerings.category,
          offering_price: offerings.price_cents,
          offering_duration: offerings.duration_minutes,
          rating: sql<number>`COALESCE((SELECT AVG(r.rating)::float FROM reviews r WHERE r.creator_id = creator_profiles.id AND r.is_public = true), 0)`,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.user_id))
        .innerJoin(offerings, eq(offerings.creator_id, creatorProfiles.id))
        .where(
          and(
            eq(creatorProfiles.is_published, true),
            sql`"creator_profiles"."search_tsv" @@ plainto_tsquery('english', ${normalizedQuery})`,
            eq(offerings.is_active, true),
            isNull(offerings.deleted_at),
          ),
        )
        .orderBy(
          sql`ts_rank("creator_profiles"."search_tsv", plainto_tsquery('english', ${normalizedQuery})) DESC`,
          asc(offerings.price_cents),
        )
    : [];

  const map = new Map<string, (typeof rows)[0] & { categories: string[] }>();
  for (const r of rows) {
    const existing = map.get(r.id);
    if (existing) {
      if (!existing.categories.includes(r.offering_category)) {
        existing.categories.push(r.offering_category);
      }
      existing.offering_price = Math.min(existing.offering_price, r.offering_price);
    } else {
      map.set(r.id, { ...r, categories: [r.offering_category] });
    }
  }
  const creators = Array.from(map.values());
  // Only show pills for categories present among the search results
  // (mirrors the "available today" behaviour — no empty pills).
  const resultCategoryIds = new Set(creators.flatMap((c) => c.categories ?? []));
  if (creators.length > 0) {
    pillCategories = categories.filter((c) => resultCategoryIds.has(c.slug));
  }
  const pills = [{ slug: "all", display_label: "All" }, ...pillCategories];
  // Category filter is applied in JS (pills always reflect the full search
  // results, not the narrowed set).
  const visibleCreators = activeCategory
    ? creators.filter((c) => c.categories.includes(activeCategory))
    : creators;

  const qParam = encodeURIComponent(normalizedQuery);

  return (
    <PublicLayout className={onAir.root} translucentNav>
      <CatalogView
        kicker="Search"
        title={
          normalizedQuery ? (
            <>
              Results for <em>“{normalizedQuery}”</em>
            </>
          ) : (
            <>
              Search <em>creators</em>
            </>
          )
        }
        pills={
          creators.length > 0
            ? pills.map((c) => ({
                key: c.slug,
                label: c.display_label,
                href: c.slug === "all" ? `/search?q=${qParam}` : `/search?q=${qParam}&category=${c.slug}`,
                active: (activeCategory ?? "all") === c.slug,
              }))
            : []
        }
        creators={visibleCreators.map((c) => ({
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
          normalizedQuery
            ? `No creators matched “${normalizedQuery}”.`
            : "Search for a creator by name or by what they do."
        }
        emptyCta={{ label: "Browse all creators", href: "/browse" }}
      />
    </PublicLayout>
  );
}
