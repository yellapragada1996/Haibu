import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { CreatorCard } from "@/components/ui/CreatorCard";
import { Pill } from "@/components/ui/Pill";
import { ButtonLink } from "@/components/ui/Button";
import { db } from "@/db";
import { creatorProfiles, users, offerings } from "@/db/schema";
import { eq, and, asc, isNull } from "drizzle-orm";

import { CATEGORIES, categoryLabel } from "@/lib/categories";

const validCategories = ["casual_talk", "asmr", "music"];

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!validCategories.includes(category)) notFound();

  const label = categoryLabel(category);

  // Category membership is determined by active OFFERINGS in that category,
  // not the creator_profiles.category field — a creator with an active
  // offering in a category appears there.
  const rows = await db
    .select({
      id: creatorProfiles.id,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
      offering_category: offerings.category,
      offering_price: offerings.price_cents,
      offering_duration: offerings.duration_minutes,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .innerJoin(offerings, eq(offerings.creator_id, creatorProfiles.id))
    .where(
      and(
        eq(creatorProfiles.is_published, true),
        eq(offerings.category, category as "casual_talk" | "asmr" | "music"),
        eq(offerings.is_active, true),
        isNull(offerings.deleted_at),
      ),
    )
    .orderBy(asc(offerings.price_cents));

  // One record per creator with full distinct category list.
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

  return (
    <PublicLayout>
      <main className="max-w-[1400px] mx-auto px-4 py-8">
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {CATEGORIES.map((c) => (
            <Link key={c.key} href={c.key === "all" ? "/" : `/browse/${c.key}`}>
              <Pill variant={c.key === category ? "active" : "inactive"}>
                {c.label}
              </Pill>
            </Link>
          ))}
        </div>

        <h1 className="text-2xl font-bold text-white mb-6">{label}</h1>

        {creators.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {creators.map((c) => (
              <Link key={c.id} href={`/creators/${c.id}`}>
                <CreatorCard
                  name={c.display_name}
                  categories={c.categories}
                  priceCents={c.offering_price}
                  durationMinutes={c.offering_duration}
                  thumbnailUrl={c.avatar_url}
                  rating={0}
                  sessionCount={0}
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-text-secondary text-lg">
              No creators here yet — check back soon.
            </p>
            <div className="mt-4">
              <ButtonLink href="/creator/profile" variant="ghost">
                Become a Creator
              </ButtonLink>
            </div>
          </div>
        )}
      </main>
    </PublicLayout>
  );
}
