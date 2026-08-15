import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { categoryLabel } from "@/lib/categories";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { db } from "@/db";
import {
  creatorProfiles,
  users,
  offerings,
  reviews,
  bookings,
} from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

function relativeTime(ts: Date): string {
  const mins = Math.floor((Date.now() - ts.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [creator] = await db
    .select({
      id: creatorProfiles.id,
      user_id: creatorProfiles.user_id,
      bio: creatorProfiles.bio,
      banner_url: creatorProfiles.banner_url,
      identity_verified: creatorProfiles.identity_verified,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(
      and(
        eq(creatorProfiles.id, id),
        eq(creatorProfiles.is_published, true),
      ),
    );

  if (!creator) notFound();

  const offeringRows = await db
    .select()
    .from(offerings)
    .where(
      and(
        eq(offerings.creator_id, id),
        eq(offerings.is_active, true),
        isNull(offerings.deleted_at),
      ),
    )
    .orderBy(offerings.price_cents);

  // Categories are derived from active offerings, not creator_profiles.category
  const distinctCategories = Array.from(
    new Set(offeringRows.map((o) => o.category)),
  );

  // Public guest reviews only — join through bookings to get the guest's name.
  const publicFilter = and(
    eq(reviews.creator_id, id),
    eq(reviews.is_public, true),
    eq(reviews.reviewer_role, "guest"),
  );

  const reviewRows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      text: reviews.text,
      tags: reviews.tags,
      created_at: reviews.created_at,
      guest_name: users.display_name,
    })
    .from(reviews)
    .innerJoin(bookings, eq(bookings.id, reviews.booking_id))
    .innerJoin(users, eq(users.id, bookings.fan_id))
    .where(publicFilter)
    .orderBy(sql`${reviews.created_at} DESC`)
    .limit(10);

  // Aggregates (public guest reviews only)
  const [ratingAgg] = await db
    .select({
      avg: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(reviews)
    .where(publicFilter);

  // Reaction tag summary (top 5 by count)
  const tagRows = await db
    .select({ tags: reviews.tags })
    .from(reviews)
    .where(publicFilter);
  const tagCounts = new Map<string, number>();
  for (const r of tagRows) {
    for (const t of r.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const tagSummary = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 5);

  const [sessionAgg] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(
      and(eq(bookings.creator_id, id), eq(bookings.status, "completed")),
    );

  // Postgres returns AVG()/COUNT() aggregates as numeric/bigint strings via
  // node-postgres — coerce to Number before using them (e.g. .toFixed()).
  const avgRating = Number(ratingAgg?.avg ?? 0);
  const reviewCount = Number(ratingAgg?.count ?? 0);
  const sessionCount = Number(sessionAgg?.count ?? 0);

  return (
    <PublicLayout>
      <main className="max-w-[900px] mx-auto px-4 py-8">
        {/* Banner — only rendered if banner_url exists; otherwise collapsed */}
        {creator.banner_url ? (
          <div className="relative">
            <img src={creator.banner_url} alt="" className="w-full h-48 object-cover rounded-card" />
            <div className="absolute -bottom-8 left-6">
              <Avatar src={creator.avatar_url} name={creator.display_name} size={72} />
            </div>
          </div>
        ) : null}

        {/* Name + meta — extra top margin only when banner exists */}
        <div className={`flex items-center gap-2 ${creator.banner_url ? "mt-10" : "mt-4"}`}>
          {!creator.banner_url && (
            <Avatar src={creator.avatar_url} name={creator.display_name} size={48} />
          )}
          <h1 className="text-2xl font-bold text-white">
            {creator.display_name}
          </h1>
          {creator.identity_verified && (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-live-green">
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 10l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {distinctCategories.map((cat) => (
            <Pill key={cat} variant="inactive">{categoryLabel(cat)}</Pill>
          ))}
        </div>

        <div className="flex gap-4 mt-2 text-sm text-text-secondary">
          <span>
            {reviewCount >= 3
              ? `★ ${avgRating.toFixed(1)} (${reviewCount} reviews)`
              : "New creator"}
          </span>
          <span>{sessionCount} sessions</span>
        </div>

        {/* Bio */}
        {creator.bio && (
          <p className="mt-4 text-text-secondary text-sm leading-relaxed">
            {creator.bio}
          </p>
        )}

        {/* Offerings */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-4">Sessions</h2>
          {offeringRows.length === 0 ? (
            <p className="text-text-secondary text-sm">No active offerings.</p>
          ) : (
            <div className="space-y-3">
              {offeringRows.map((o) => (
                <Card key={o.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{o.title}</p>
                    <p className="text-sm text-text-secondary">
                      {o.duration_minutes} min · $
                      {(o.price_cents / 100).toFixed(2)}
                    </p>
                  </div>
                  <ButtonLink href={`/book/${creator.id}?offering=${o.id}`} size="small">
                    Book
                  </ButtonLink>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Reviews */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-4">Reviews</h2>

          {tagSummary.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {tagSummary.map((t) => (
                <span
                  key={t.tag}
                  className="rounded-pill bg-bg-card-hover px-3 py-1 text-xs text-text-secondary"
                >
                  {t.tag} ({t.count})
                </span>
              ))}
            </div>
          )}

          {reviewRows.length === 0 ? (
            <p className="text-text-secondary text-sm">
              No reviews yet — be the first to book a session.
            </p>
          ) : (
            <div className="space-y-3">
              {reviewRows.map((r) => {
                const firstName =
                  (r.guest_name ?? "").split(" ")[0] || "Guest";
                return (
                  <Card key={r.id}>
                    <div className="flex items-center gap-2">
                      <Avatar name={firstName} size={28} />
                      <span className="text-sm text-white">{firstName}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className="text-sm text-accent"
                        aria-label={`${r.rating ?? 0} stars`}
                      >
                        {"★".repeat(r.rating ?? 0)}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {r.created_at
                          ? relativeTime(new Date(r.created_at))
                          : ""}
                      </span>
                    </div>
                    {r.text && (
                      <p className="mt-2 text-sm text-text-secondary">{r.text}</p>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-pill bg-bg-card-hover px-2 py-0.5 text-xs text-text-secondary"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}
