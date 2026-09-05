import Link from "next/link";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { CreatorCard } from "@/components/ui/CreatorCard";
import { Pill } from "@/components/ui/Pill";
import { db } from "@/db";
import {
  creatorProfiles,
  users,
  offerings,
  bookings,
  reviews,
} from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getCategories, categoriesToLabelMap } from "@/lib/categories";
import { getAvailableTodayCreatorIds } from "@/lib/availability";

// Reads a live DB — render on demand, never prerender at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Browse creators — Haibu" };


// Full catalog — the "View more" destination for Available today + Discover.
async function getAllCreators() {
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAnon = !user;

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
        {isAnon && (
          <p className="mb-6 text-center text-[22px] font-bold text-text-primary">
            Book a live 1:1 video session with a creator
          </p>
        )}

        <div className="mb-8 flex gap-2 overflow-x-auto pb-2">
          <Link href="/">
            <Pill variant="active">All</Pill>
          </Link>
          {pillCategories.map((c) => (
            <Link
              key={c.slug}
              href={
                onlyAvailableToday
                  ? `/browse/${c.slug}?available=today`
                  : `/browse/${c.slug}`
              }
            >
              <Pill variant="inactive">{c.display_label}</Pill>
            </Link>
          ))}
        </div>

        <h1 className="mb-6 text-lg font-semibold text-text-primary">
          {onlyAvailableToday ? "Available today" : "All creators"}
        </h1>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
          {creators.map((c) => (
            <Link
              key={c.id}
              href={c.slug ? `/@${c.slug}` : `/creators/${c.id}`}
              prefetch={false}
              aria-label={`Book a session with ${c.display_name}`}
            >
              <CreatorCard
                name={c.display_name}
                categories={c.categories}
                priceCents={c.offering_price}
                rating={c.rating}
                thumbnailUrl={c.avatar_url}
                categoryLabels={categoryLabels}
              />
            </Link>
          ))}
        </div>
      </main>
    </PublicLayout>
  );
}
