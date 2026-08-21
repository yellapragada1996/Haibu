import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { ShareButton } from "@/components/ui/ShareButton";
import { FaqAccordion } from "@/components/FaqAccordion";
import { getCategories, categoriesToLabelMap } from "@/lib/categories";
import { db } from "@/db";
import { creatorProfiles, users, offerings, reviews, bookings } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

// Catch-all for the shareable creator handle: haibu.live/@queen → creator slug.
// Static routes (login, dashboard, book, …) take precedence in Next.js; this
// only serves unmatched paths. Anything that isn't @[slug] → 404.
export default async function CreatorHandlePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: segments } = await params;
  // Turbopack may pass the raw URL-encoded segment ("%40queen") in one render
  // pass and the decoded ("@queen") in another — normalize both.
  let handle = segments?.[0] ?? "";
  try {
    handle = decodeURIComponent(handle);
  } catch {
    /* malformed — keep as-is */
  }
  if (!handle.startsWith("@")) notFound();
  const slug = handle.slice(1).toLowerCase();
  if (!slug) notFound();

  const categoryList = await getCategories();
  const categoryLabels = categoriesToLabelMap(categoryList);

  const [creator] = await db
    .select({
      id: creatorProfiles.id,
      bio: creatorProfiles.bio,
      banner_url: creatorProfiles.banner_url,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(
      and(
        eq(creatorProfiles.slug, slug),
        eq(creatorProfiles.is_published, true),
      ),
    );

  if (!creator) notFound();

  const offeringRows = await db
    .select()
    .from(offerings)
    .where(
      and(
        eq(offerings.creator_id, creator.id),
        eq(offerings.is_active, true),
        isNull(offerings.deleted_at),
      ),
    )
    .orderBy(offerings.price_cents);

  // Categories derived from active offerings.
  const distinctCategories = Array.from(
    new Set(offeringRows.map((o) => o.category)),
  );
  const visibleCategories = distinctCategories.slice(0, 3);
  const extraCategories = Math.max(0, distinctCategories.length - 3);

  const publicFilter = and(
    eq(reviews.creator_id, creator.id),
    eq(reviews.is_public, true),
    eq(reviews.reviewer_role, "guest"),
  );

  const reviewRows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      text: reviews.text,
      guest_name: users.display_name,
    })
    .from(reviews)
    .innerJoin(bookings, eq(bookings.id, reviews.booking_id))
    .innerJoin(users, eq(users.id, bookings.fan_id))
    .where(publicFilter)
    .orderBy(sql`${reviews.created_at} DESC`)
    .limit(2);

  const [ratingAgg] = await db
    .select({
      avg: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(reviews)
    .where(publicFilter);

  const avgRating = Number(ratingAgg?.avg ?? 0);
  const reviewCount = Number(ratingAgg?.count ?? 0);
  const cheapest = offeringRows[0];

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-[800px] px-4 py-6">
        {/* Banner — only if banner_url exists; hidden entirely when absent */}
        {creator.banner_url ? (
          <div className="relative">
            <img
              src={creator.banner_url}
              alt=""
              aria-hidden="true"
              className="h-36 w-full rounded-card object-cover"
            />
            <div className="absolute -bottom-8 left-6">
              <Avatar
                src={creator.avatar_url}
                name={creator.display_name}
                size={72}
              />
            </div>
          </div>
        ) : null}

        {/* Identity: avatar (no banner), name + share, category pills */}
        <div
          className={`flex items-center gap-3 ${creator.banner_url ? "mt-10" : "mt-4"}`}
        >
          {!creator.banner_url && (
            <Avatar
              src={creator.avatar_url}
              name={creator.display_name}
              size={48}
            />
          )}
          <h1 className="text-2xl font-bold text-white">{creator.display_name}</h1>
          <ShareButton
            url={`${process.env.NEXT_PUBLIC_APP_URL ?? "https://haibu.live"}/@${slug}`}
            name={creator.display_name}
          />
        </div>

        {/* Category pills — brand red, max 3 + "+N" */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleCategories.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center rounded-pill bg-brand px-2.5 py-1 text-xs font-semibold text-white"
            >
              {categoryLabels[cat] ?? cat}
            </span>
          ))}
          {extraCategories > 0 && (
            <span className="inline-flex items-center rounded-pill border border-border-subtle bg-bg-card px-2.5 py-1 text-xs font-semibold text-text-secondary">
              +{extraCategories}
            </span>
          )}
        </div>

        {/* Meta: rating only when it exists (>=3 reviews for a meaningful
            average); price anchor; no session count / "New creator" (v2). */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
          {reviewCount >= 1 && (
            <span className="text-rating">
              ★ {avgRating.toFixed(1)}
              <span className="text-text-secondary">
                {" "}({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
              </span>
            </span>
          )}
          {cheapest && (
            <span>sessions from ${(cheapest.price_cents / 100).toFixed(0)}</span>
          )}
        </div>

        {/* Bio */}
        {creator.bio && (
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            {creator.bio}
          </p>
        )}

        {/* How it works — SVG icons only, no emojis */}
        <div className="mt-5 flex items-center justify-around rounded-card border border-border-subtle bg-bg-card px-4 py-3">
          <span className="flex flex-col items-center gap-1 text-[11px] text-text-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Pick a time
          </span>
          <span className="flex flex-col items-center gap-1 text-[11px] text-text-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="1" y="4" width="22" height="16" rx="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Pay securely
          </span>
          <span className="flex flex-col items-center gap-1 text-[11px] text-text-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m22 8-6 4 6 4V8Z" />
              <rect x="2" y="6" width="14" height="12" rx="2" />
            </svg>
            Join live
          </span>
        </div>

        {/* Offerings — all of them, each with its own Book button */}
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-white">Offerings</h2>
          {offeringRows.length === 0 ? (
            <p className="text-sm text-text-secondary">No active offerings.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {offeringRows.map((o) => (
                <Card
                  key={o.id}
                  className="flex min-h-[72px] items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-white">{o.title}</p>
                    <p className="text-sm text-text-secondary">
                      {o.duration_minutes} min
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white">
                      ${(o.price_cents / 100).toFixed(2)}
                    </span>
                    <ButtonLink
                      href={`/slot/${creator.id}?offering=${o.id}`}
                      size="small"
                      aria-label={`Book ${o.title}`}
                    >
                      Book
                    </ButtonLink>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* FAQ — collapsible accordion, between offerings and reviews */}
        <FaqAccordion />

        {/* Recent reviews — inline previews (2) */}
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-white">Recent reviews</h2>
          {reviewRows.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No reviews yet — be the first to book a session.
            </p>
          ) : (
            <div className="grid gap-2">
              {reviewRows.map((r) => {
                const firstName = (r.guest_name ?? "").split(" ")[0] || "Guest";
                return (
                  <Card key={r.id}>
                    <div className="flex items-center gap-2">
                      <Avatar name={firstName} size={26} />
                      <span className="text-sm font-medium text-white">
                        {firstName}
                      </span>
                      <span
                        className="text-sm text-rating"
                        aria-label={`${r.rating ?? 0} stars`}
                      >
                        {"★".repeat(r.rating ?? 0)}
                      </span>
                    </div>
                    {r.text && (
                      <p className="mt-1 text-sm text-text-secondary">
                        {r.text}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
          {reviewCount > 2 && (
            <Link
              href={`/creators/${creator.id}`}
              className="mt-3 inline-block text-sm text-text-secondary hover:text-white"
            >
              View all {reviewCount} reviews →
            </Link>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug: segments } = await params;
  let handle = segments?.[0] ?? "";
  try {
    handle = decodeURIComponent(handle);
  } catch {
    /* keep as-is */
  }
  if (!handle.startsWith("@")) return {};
  const slug = handle.slice(1).toLowerCase();

  const [creator] = await db
    .select({
      display_name: users.display_name,
      avatar_url: users.avatar_url,
      bio: creatorProfiles.bio,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(
      and(eq(creatorProfiles.slug, slug), eq(creatorProfiles.is_published, true)),
    );

  if (!creator) return {};
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://haibu.live";
  return {
    title: `Book a live 1:1 session with @${slug}`,
    description:
      creator.bio?.slice(0, 160) ??
      `Book a live 1:1 session with ${creator.display_name} on Haibu.`,
    openGraph: {
      title: `Book a live 1:1 session with @${slug}`,
      description:
        creator.bio?.slice(0, 160) ??
        `Book a live 1:1 session with ${creator.display_name} on Haibu.`,
      images: creator.avatar_url
        ? [{ url: creator.avatar_url, alt: creator.display_name }]
        : undefined,
      type: "website",
      url: `${base}/@${slug}`,
    },
  };
}
