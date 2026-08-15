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

  // Reviews — join through bookings to get the fan's display_name
  const reviewRows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      text: reviews.text,
      created_at: reviews.created_at,
      reviewer_name: users.display_name,
    })
    .from(reviews)
    .innerJoin(bookings, eq(bookings.id, reviews.booking_id))
    .innerJoin(users, eq(users.id, bookings.fan_id))
    .where(eq(reviews.creator_id, id))
    .orderBy(sql`${reviews.created_at} DESC`)
    .limit(10);

  // Aggregates
  const [ratingAgg] = await db
    .select({ avg: sql<number>`COALESCE(AVG(${reviews.rating}), 0)` })
    .from(reviews)
    .where(eq(reviews.creator_id, id));

  const [sessionAgg] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(
      and(eq(bookings.creator_id, id), eq(bookings.status, "completed")),
    );

  // Postgres returns AVG()/COUNT() aggregates as numeric/bigint strings via
  // node-postgres — coerce to Number before using them (e.g. .toFixed()).
  const avgRating = Number(ratingAgg?.avg ?? 0);
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
          <span>★ {avgRating > 0 ? avgRating.toFixed(1) : "—"}</span>
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
          {reviewRows.length === 0 ? (
            <p className="text-text-secondary text-sm">
              No reviews yet — be the first to book a session.
            </p>
          ) : (
            <div className="space-y-3">
              {reviewRows.map((r) => (
                <Card key={r.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-white">
                      ★ {r.rating}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      —{" "}
                      {r.created_at
                        ? new Date(r.created_at).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                  {r.text && (
                    <p className="text-sm text-text-secondary">{r.text}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}
