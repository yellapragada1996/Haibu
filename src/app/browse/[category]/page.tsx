import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { CreatorCard } from "@/components/ui/CreatorCard";
import { Pill } from "@/components/ui/Pill";
import { ButtonLink } from "@/components/ui/Button";
import { db } from "@/db";
import { creatorProfiles, users, offerings, reviews } from "@/db/schema";
import { eq, and, asc, isNull, sql } from "drizzle-orm";

import { getCategories, categoriesToLabelMap } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";
import { generateAvailableSlots } from "@/lib/availability";

// Does the creator have at least one open slot from now until end of today?
async function hasSlotToday(
  creatorId: string,
  offeringIds: string[],
): Promise<boolean> {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  for (const offeringId of offeringIds) {
    const slots = await generateAvailableSlots({
      creator_id: creatorId,
      offering_id: offeringId,
      from: now,
      to: endOfDay,
    });
    if (slots.length > 0) return true;
  }
  return false;
}

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

  // Preserve the "available today" context when navigating between pills.
  const { available } = await searchParams;
  const onlyAvailableToday = available === "today";
  if (onlyAvailableToday) {
    const filtered: (typeof creators)[number][] = [];
    for (const c of creators) {
      if (await hasSlotToday(c.id, c.offeringIds)) filtered.push(c);
    }
    creators = filtered;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAnon = !user;

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
        {isAnon && (
          <p className="mb-6 text-center text-[22px] font-bold text-white">
            Book a live 1:1 video session with a creator
          </p>
        )}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {[{ slug: "all", display_label: "All" }, ...categories].map((c) => (
            <Link
              key={c.slug}
              href={
                c.slug === "all"
                  ? onlyAvailableToday
                    ? "/browse?available=today"
                    : "/"
                  : onlyAvailableToday
                    ? `/browse/${c.slug}?available=today`
                    : `/browse/${c.slug}`
              }
            >
              <Pill variant={c.slug === category ? "active" : "inactive"}>
                {c.display_label}
              </Pill>
            </Link>
          ))}
        </div>

        <h1 className="text-2xl font-bold text-white mb-6">{label}</h1>

        {creators.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
            {creators.map((c) => (
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
