import Link from "next/link";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { CreatorCard } from "@/components/ui/CreatorCard";
import { Pill } from "@/components/ui/Pill";
import { ButtonLink } from "@/components/ui/Button";
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

// Reads a live DB — render on demand, never prerender at build time
// (the build environment has no database).
export const dynamic = "force-dynamic";

// 2 rows × 5 on desktop (2 rows × 2 on mobile) — "View more" expands.
const ROWS = 10;

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
  // Sort: rating ↓ → sessions ↓ → price ↑ (no sort UI shown).
  return Array.from(map.values()).sort(
    (a, b) =>
      b.rating - a.rating ||
      b.sessionCount - a.sessionCount ||
      a.offering_price - b.offering_price,
  );
}

export default async function HomePage() {
  const creators = await getCreatorsWithOfferings();
  // "Available today" = creators with a window covering today (+ lead time).
  const availableTodayIds = await getAvailableTodayCreatorIds();
  const availableToday = creators.filter((c) => availableTodayIds.has(c.id));
  const categories = await getCategories();
  const categoryLabels = categoriesToLabelMap(categories);

  // Value prop is for cold (anonymous) visitors only.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAnon = !user;

  const card = (c: (typeof creators)[number]) => (
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
  );

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
        {isAnon && (
          <h1 className="mb-6 px-2 text-center text-[22px] font-bold text-white">
            Book a live 1:1 video session with a creator
          </h1>
        )}

        {/* Category filter pills — Trending (default) + categories */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <Pill variant="active">All</Pill>
          {categories.map((c) => (
            <Link key={c.slug} href={`/browse/${c.slug}`}>
              <Pill variant="inactive">{c.display_label}</Pill>
            </Link>
          ))}
        </div>

        {/* Available today — hidden when no creator is bookable today */}
        {availableToday.length > 0 && (
        <section className="mt-8">
          <div className="mb-6 flex items-baseline justify-between px-1">
            <h2 className="text-lg font-semibold text-white">
              Available today
            </h2>
            <Link
              href="/browse?available=today"
              className="text-sm text-text-secondary hover:text-white"
            >
              View more →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
            {availableToday.slice(0, ROWS).map(card)}
          </div>
        </section>
        )}

        {/* Discover — 2 rows + View more */}
        <section className="mt-10">
          <div className="mb-6 flex items-baseline justify-between px-1">
            <h2 className="text-lg font-semibold text-white">Discover</h2>
            <Link
              href="/browse"
              className="text-sm text-text-secondary hover:text-white"
            >
              View more →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
            {creators.slice(0, ROWS * 3).map(card)}
          </div>
        </section>

        {/* Become a Creator band — centered */}
        <section className="mt-12 rounded-card border border-border-subtle bg-bg-surface px-6 py-10 text-center">
          <h2 className="text-lg font-semibold text-white">
            Become a creator
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Book live sessions, grow your audience, get paid.
          </p>
          <ButtonLink href="/creator" className="mt-5">
            Become a Creator
          </ButtonLink>
        </section>

        <footer className="mt-16 border-t border-border-subtle pt-8 pb-12">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-text-secondary">
            <Link href="/terms" className="hover:text-white">
              Terms of Service
            </Link>
            <Link href="/support" className="hover:text-white">
              Support
            </Link>
          </div>
          <p className="mt-4 text-xs text-text-tertiary">&copy; 2026 Haibu</p>
        </footer>
      </main>
    </PublicLayout>
  );
}
