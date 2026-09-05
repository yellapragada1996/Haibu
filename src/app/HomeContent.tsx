"use client";

import { useState } from "react";
import Link from "next/link";
import { CreatorCard } from "@/components/ui/CreatorCard";
import { Pill } from "@/components/ui/Pill";
import { ButtonLink } from "@/components/ui/Button";

export interface HomeCreator {
  id: string;
  slug: string | null;
  display_name: string;
  avatar_url: string | null;
  categories: string[];
  offering_price: number;
  rating: number;
}

interface HomeContentProps {
  creators: HomeCreator[];
  availableToday: HomeCreator[];
  categories: { slug: string; display_label: string }[];
  categoryLabels: Record<string, string>;
  isAnon: boolean;
}

const ROWS = 10;

export function HomeContent({
  creators,
  availableToday,
  categories,
  categoryLabels,
  isAnon,
}: HomeContentProps) {
  const [active, setActive] = useState<string | null>(null);

  const filtered = active
    ? creators.filter((c) => c.categories.includes(active))
    : null;
  const filteredAvailable = active
    ? availableToday.filter((c) => c.categories.includes(active))
    : null;

  const showAvailable = active ? filteredAvailable!.length > 0 : availableToday.length > 0;
  const availableList = active ? filteredAvailable! : availableToday;
  const discoverList = active ? filtered! : creators;

  const card = (c: HomeCreator) => (
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
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
      {isAnon && (
        <h1 className="mb-6 px-2 text-center text-[22px] font-bold text-text-primary">
          Book a live 1:1 video session with a creator
        </h1>
      )}

      {/* Category filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Pill
          variant={active === null ? "active" : "inactive"}
          onClick={() => setActive(null)}
        >
          All
        </Pill>
        {categories.map((c) => (
          <Pill
            key={c.slug}
            variant={active === c.slug ? "active" : "inactive"}
            onClick={() => setActive(c.slug)}
          >
            {c.display_label}
          </Pill>
        ))}
      </div>

      {/* Available today */}
      {showAvailable && (
        <section className="mt-8">
          <div className="mb-6 flex items-baseline justify-between px-1">
            <h2 className="text-lg font-semibold text-text-primary">
              Available today
            </h2>
            <Link
              href="/browse?available=today"
              className="text-sm text-text-secondary hover:text-text-primary"
            >
              View more →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
            {availableList.slice(0, ROWS).map(card)}
          </div>
        </section>
      )}

      {/* Discover */}
      <section className="mt-10">
        <div className="mb-6 flex items-baseline justify-between px-1">
          <h2 className="text-lg font-semibold text-text-primary">Discover</h2>
          <Link
            href="/browse"
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            View more →
          </Link>
        </div>
        {discoverList.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
            {discoverList.slice(0, ROWS * 3).map(card)}
          </div>
        ) : (
          <p className="py-16 text-center text-lg text-text-secondary">
            No creators in this category yet — check back soon.
          </p>
        )}
      </section>

      {/* Become a Creator band */}
      <section className="mt-12 rounded-card border border-border-subtle bg-bg-surface px-6 py-10 text-center">
        <h2 className="text-lg font-semibold text-text-primary">
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
          <Link href="/terms" className="hover:text-text-primary">
            Terms of Service
          </Link>
          <Link href="/support" className="hover:text-text-primary">
            Support
          </Link>
        </div>
        <p className="mt-4 text-xs text-text-tertiary">&copy; 2026 Haibu</p>
      </footer>
    </main>
  );
}
