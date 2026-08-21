import Link from "next/link";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { CreatorCard } from "@/components/ui/CreatorCard";
import { Pill } from "@/components/ui/Pill";
import { db } from "@/db";
import { creatorProfiles, users, offerings, reviews } from "@/db/schema";
import { eq, and, asc, isNull, sql } from "drizzle-orm";

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

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {pills.map((c) => (
            <Link
              key={c.slug}
              href={
                c.slug === "all"
                  ? `/search?q=${encodeURIComponent(normalizedQuery)}`
                  : `/search?q=${encodeURIComponent(normalizedQuery)}&category=${c.slug}`
              }
            >
              <Pill
                variant={
                  (activeCategory ?? "all") === c.slug ? "active" : "inactive"
                }
              >
                {c.display_label}
              </Pill>
            </Link>
          ))}
        </div>

        <h1 className="text-lg font-semibold text-white mb-2">
          {q ? `Search: "${q}"` : "Search creators"}
        </h1>

        {q && creators.length === 0 && (
          <div className="text-center py-16">
            <p className="text-text-secondary text-lg">
              No creators matched &quot;{q}&quot;
            </p>
          </div>
        )}

        {creators.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4 mt-6">
            {visibleCreators.map((c) => (
              <Link key={c.id} href={c.slug ? `/@${c.slug}` : `/creators/${c.id}`}>
                <CreatorCard
                  name={c.display_name}
                  categories={c.categories}
                  categoryLabels={categoryLabels}
                  priceCents={c.offering_price}
                  durationMinutes={c.offering_duration}
                  thumbnailUrl={c.avatar_url}
                  rating={c.rating}
                  sessionCount={0}
                />
              </Link>
            ))}
          </div>
        )}
      </main>
    </PublicLayout>
  );
}
