import { PublicLayout } from "@/components/layout/PublicLayout";
import { db } from "@/db";
import {
  bookings,
  creatorProfiles,
  users,
  offerings,
  reviews,
} from "@/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { eq, and, or, gt, asc, isNull, isNotNull, sql, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getCategories, categoriesToLabelMap } from "@/lib/categories";
import { getAvailableTodayCreatorIds } from "@/lib/availability";
import {
  HomeContent,
  type HomeCreator,
  type HomeReview,
  type HomeViewer,
} from "./HomeContent";
import onAir from "./on-air.module.css";

export const dynamic = "force-dynamic";

const fanUser = alias(users, "fan_user");
const sessionFan = alias(users, "session_fan");
const sessionCreator = alias(users, "session_creator");

async function getCreatorsWithOfferings() {
  const rows = await db
    .select({
      id: creatorProfiles.id,
      slug: creatorProfiles.slug,
      bio: creatorProfiles.bio,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
      offering_category: offerings.category,
      offering_price: offerings.price_cents,
      offering_id: offerings.id,
      rating: sql<number>`COALESCE((SELECT AVG(r.rating)::float FROM reviews r WHERE r.creator_id = creator_profiles.id AND r.is_public = true), 0)`,
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

  const map = new Map<string, typeof rows[0] & { categories: string[] }>();
  for (const r of rows) {
    const existing = map.get(r.id);
    if (existing) {
      if (!existing.categories.includes(r.offering_category)) {
        existing.categories.push(r.offering_category);
      }
      existing.offering_price = Math.min(existing.offering_price, r.offering_price);
    } else {
      map.set(r.id, { ...r, categories: [r.offering_category] });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      b.rating - a.rating ||
      b.sessionCount - a.sessionCount ||
      a.offering_price - b.offering_price,
  );
}

// "Maria Gonzalez" -> "Maria G."
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

async function getFeaturedReviews(labels: Record<string, string>): Promise<HomeReview[]> {
  const rows = await db
    .select({
      id: reviews.id,
      text: reviews.text,
      guest: fanUser.display_name,
      creator: users.display_name,
      category: creatorProfiles.category,
    })
    .from(reviews)
    .innerJoin(bookings, eq(bookings.id, reviews.booking_id))
    .innerJoin(fanUser, eq(fanUser.id, bookings.fan_id))
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, reviews.creator_id))
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(
      and(
        eq(reviews.is_public, true),
        eq(reviews.reviewer_role, "guest"),
        eq(reviews.rating, 5),
        isNotNull(reviews.text),
        sql`length(trim(${reviews.text})) >= 40`,
      ),
    )
    .orderBy(desc(reviews.published_at))
    .limit(3);

  return rows.map((r) => ({
    id: r.id,
    text: (r.text ?? "").trim(),
    guest: shortName(r.guest),
    creator: r.creator,
    category: labels[r.category] ?? r.category,
  }));
}

function dayKey(d: Date, tz: string): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz });
}

function sessionWhen(start: Date, end: Date, tz: string, now: Date) {
  if (now >= start && now < end) return { label: "Happening now", soon: true };
  const time = start.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const soon = start.getTime() - now.getTime() <= 15 * 60 * 1000;
  const key = dayKey(start, tz);
  if (key === dayKey(now, tz)) return { label: `Today · ${time}`, soon };
  if (key === dayKey(new Date(now.getTime() + 86_400_000), tz)) return { label: `Tomorrow · ${time}`, soon };
  const date = start.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  return { label: `${date} · ${time}`, soon };
}

async function getViewer(userId: string): Promise<HomeViewer> {
  const [me] = await db
    .select({
      display_name: users.display_name,
      timezone: users.timezone,
      profile_id: creatorProfiles.id,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.user_id, users.id))
    .where(eq(users.id, userId));

  const profileId = me?.profile_id ?? null;
  const tz = me?.timezone || "UTC";

  const [next] = await db
    .select({
      id: bookings.id,
      start_at: bookings.start_at,
      end_at: bookings.end_at,
      fan_id: bookings.fan_id,
      offering_title: offerings.title,
      fan_name: sessionFan.display_name,
      fan_avatar: sessionFan.avatar_url,
      creator_name: sessionCreator.display_name,
      creator_avatar: sessionCreator.avatar_url,
    })
    .from(bookings)
    .innerJoin(offerings, eq(offerings.id, bookings.offering_id))
    .innerJoin(sessionFan, eq(sessionFan.id, bookings.fan_id))
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .innerJoin(sessionCreator, eq(sessionCreator.id, creatorProfiles.user_id))
    .where(
      and(
        eq(bookings.status, "confirmed"),
        gt(bookings.end_at, sql`NOW()`),
        profileId
          ? or(eq(bookings.fan_id, userId), eq(bookings.creator_id, profileId))
          : eq(bookings.fan_id, userId),
      ),
    )
    .orderBy(asc(bookings.start_at))
    .limit(1);

  let nextSession: HomeViewer["nextSession"] = null;
  if (next?.start_at && next.end_at) {
    const asGuest = next.fan_id === userId;
    const when = sessionWhen(new Date(next.start_at), new Date(next.end_at), tz, new Date());
    nextSession = {
      id: next.id,
      with: asGuest ? next.creator_name : next.fan_name,
      avatar: asGuest ? next.creator_avatar : next.fan_avatar,
      offering: next.offering_title,
      when: when.label,
      soon: when.soon,
    };
  }

  return {
    firstName: me?.display_name?.trim().split(/\s+/)[0] || "there",
    isCreator: !!profileId,
    nextSession,
  };
}

export default async function HomePage() {
  const creators = await getCreatorsWithOfferings();
  const availableTodayIds = await getAvailableTodayCreatorIds();
  const categories = await getCategories();
  const categoryLabels = categoriesToLabelMap(categories);
  const featuredReviews = await getFeaturedReviews(categoryLabels);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAnon = !user;
  const viewer = user ? await getViewer(user.id) : null;

  const toClient = (c: (typeof creators)[number]): HomeCreator => ({
    id: c.id,
    slug: c.slug,
    display_name: c.display_name,
    avatar_url: c.avatar_url,
    bio: c.bio?.trim() || null,
    categories: c.categories,
    offering_price: c.offering_price,
  });

  const availableToday = creators.filter((c) => availableTodayIds.has(c.id));

  return (
    <PublicLayout className={onAir.root} translucentNav>
      <HomeContent
        creators={creators.map(toClient)}
        availableToday={availableToday.map(toClient)}
        categories={categories.map((c) => ({
          slug: c.slug,
          display_label: c.display_label,
        }))}
        categoryLabels={categoryLabels}
        reviews={featuredReviews}
        isAnon={isAnon}
        viewer={viewer}
      />
    </PublicLayout>
  );
}
