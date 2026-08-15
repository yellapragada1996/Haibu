import Link from "next/link";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { CreatorCard } from "@/components/ui/CreatorCard";
import { Pill } from "@/components/ui/Pill";
import { ButtonLink, Button } from "@/components/ui/Button";
import { db } from "@/db";
import { creatorProfiles, users, offerings, bookings } from "@/db/schema";
import { eq, and, sql, gte, desc, asc, isNull } from "drizzle-orm";

import { CATEGORIES } from "@/lib/categories";

// For shelves that show one card per creator (not per category), dedupe by id.
function dedupeCreators<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

async function getCreatorsWithOfferings() {
  const rows = await db
    .select({
      id: creatorProfiles.id,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
      identity_verified: creatorProfiles.identity_verified,
      offering_category: offerings.category,
      offering_price: offerings.price_cents,
      offering_duration: offerings.duration_minutes,
      offering_id: offerings.id,
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
    )
    .orderBy(asc(offerings.price_cents));

  // One record per creator with the full distinct category list.
  // Lowest-priced offering provides price/duration ("from $X").
  const map = new Map<
    string,
    typeof rows[0] & { categories: string[]; sessionCount: number; rating: number }
  >();
  for (const r of rows) {
    const existing = map.get(r.id);
    if (existing) {
      if (!existing.categories.includes(r.offering_category)) {
        existing.categories.push(r.offering_category);
      }
    } else {
      map.set(r.id, {
        ...r,
        categories: [r.offering_category],
        sessionCount: 0,
        rating: 0,
      });
    }
  }
  return Array.from(map.values());
}

function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      {action && (
        <Link
          href={action.href}
          className="text-sm text-text-secondary hover:text-white transition-colors"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

export default async function HomePage() {
  const creators = await getCreatorsWithOfferings();

  if (creators.length < 3) {
    return (
      <PublicLayout>
        <main className="max-w-[1400px] mx-auto px-4 py-8">
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {CATEGORIES.map((c) => (
              <Pill key={c.key} variant={c.key === "all" ? "active" : "inactive"}>
                {c.label}
              </Pill>
            ))}
          </div>

          <h2 className="text-xl font-semibold text-white mb-6">
            Browse creators
          </h2>
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
                    rating={c.rating}
                    sessionCount={c.sessionCount}
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-text-secondary text-lg">
                No creators yet — be the first!
              </p>
              <div className="mt-4">
                <ButtonLink href="/creator/profile">
                  Become a Creator
                </ButtonLink>
              </div>
            </div>
          )}

          <div className="mt-16 bg-bg-surface rounded-modal p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              Become a Creator
            </h2>
            <p className="text-text-secondary mb-6 max-w-md mx-auto">
              Share your talent, set your own schedule, and earn money doing what you love.
            </p>
            <ButtonLink href="/creator/profile">Get started</ButtonLink>
          </div>

          <footer className="mt-16 border-t border-border-subtle pt-8 pb-12">
            <div className="flex flex-wrap gap-6 text-sm text-text-secondary">
              <Link href="#" className="hover:text-white">About</Link>
              <Link href="#" className="hover:text-white">Terms of Service</Link>
              <Link href="#" className="hover:text-white">Privacy Policy</Link>
              <Link href="#" className="hover:text-white">Trust &amp; Safety</Link>
              <Link href="#" className="hover:text-white">Support</Link>
              <Link href="/creator/profile" className="hover:text-white">Become a Creator</Link>
            </div>
            <p className="mt-4 text-xs text-text-tertiary">
              &copy; {new Date().getFullYear()} haibu. All rights reserved.
            </p>
          </footer>
        </main>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <main className="max-w-[1400px] mx-auto px-4 py-8">
        {/* Category pills */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {CATEGORIES.map((c) => (
            <Link key={c.key} href={c.key === "all" ? "/" : `/browse/${c.key}`}>
              <Pill variant={c.key === "all" ? "active" : "inactive"}>
                {c.label}
              </Pill>
            </Link>
          ))}
        </div>

        {/* Available Today */}
        <section className="mb-10">
          <SectionHeading title="Available today" />
          <div className="flex gap-4 overflow-x-auto pb-4 horizontal-scroll">
            {dedupeCreators(creators).slice(0, 12).map((c) => (
              <Link key={c.id} href={`/creators/${c.id}`}>
                <CreatorCard
                  name={c.display_name}
                  categories={c.categories}
                  priceCents={c.offering_price}
                  durationMinutes={c.offering_duration}
                  thumbnailUrl={c.avatar_url}
                  rating={c.rating}
                  sessionCount={c.sessionCount}
                  availableToday
                />
              </Link>
            ))}
          </div>
        </section>

        {/* Trending */}
        <section className="mb-10">
          <SectionHeading title="Trending this week" />
          <div className="flex gap-4 overflow-x-auto pb-4 horizontal-scroll">
            {dedupeCreators(creators).slice(0, 12).map((c) => (
              <Link key={c.id} href={`/creators/${c.id}`}>
                <CreatorCard
                  name={c.display_name}
                  categories={c.categories}
                  priceCents={c.offering_price}
                  durationMinutes={c.offering_duration}
                  thumbnailUrl={c.avatar_url}
                  rating={c.rating}
                  sessionCount={c.sessionCount}
                />
              </Link>
            ))}
          </div>
        </section>

        {/* Category shelves */}
        {["casual_talk", "asmr", "music"].map((cat) => {
          const catCreators = creators.filter((c) => c.categories.includes(cat));
          if (catCreators.length < 3) return null;
          const label = CATEGORIES.find((c) => c.key === cat)?.label ?? cat;
          return (
            <section key={cat} className="mb-10">
              <SectionHeading
                title={label}
                action={{ label: "See all", href: `/browse/${cat}` }}
              />
          <div className="flex gap-4 overflow-x-auto pb-4 horizontal-scroll horizontal-scroll">
                {catCreators.slice(0, 12).map((c) => (
                  <Link key={c.id} href={`/creators/${c.id}`}>
                    <CreatorCard
                      name={c.display_name}
                      categories={c.categories}
                      priceCents={c.offering_price}
                      durationMinutes={c.offering_duration}
                      thumbnailUrl={c.avatar_url}
                      rating={c.rating}
                      sessionCount={c.sessionCount}
                    />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {/* Become a Creator band */}
        <div className="my-16 bg-bg-surface rounded-modal p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            Become a Creator
          </h2>
          <p className="text-text-secondary mb-6 max-w-md mx-auto">
            Share your talent, set your own schedule, and earn money doing what
            you love.
          </p>
          <ButtonLink href="/creator/profile">Get started</ButtonLink>
        </div>

        {/* Footer */}
        <footer className="border-t border-border-subtle pt-8 pb-12">
          <div className="flex flex-wrap gap-6 text-sm text-text-secondary">
            <Link href="#" className="hover:text-white">
              About
            </Link>
            <Link href="#" className="hover:text-white">
              Terms of Service
            </Link>
            <Link href="#" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link href="#" className="hover:text-white">
              Trust &amp; Safety
            </Link>
            <Link href="#" className="hover:text-white">
              Support
            </Link>
            <Link href="/creator/profile" className="hover:text-white">
              Become a Creator
            </Link>
          </div>
          <p className="mt-4 text-xs text-text-tertiary">
            &copy; {new Date().getFullYear()} haibu. All rights reserved.
          </p>
        </footer>
      </main>
    </PublicLayout>
  );
}
