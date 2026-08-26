import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  creatorProfiles,
  reviews,
  users,
  offerings,
  availabilityWindows,
  availabilityBlocks,
  availabilityDateOverrides,
  bookings,
} from "@/db/schema";
import { and, eq, isNotNull, isNull, sql, count } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Kpi } from "@/components/ui/Kpi";
import { ShareButton } from "@/components/ui/ShareButton";
import { SetupWizard } from "./SetupWizard";
import { reconcileCreatorOnboarding } from "@/lib/creator-onboarding";
import { getCategories, categoriesToLabelMap } from "@/lib/categories";
import {
  formatCents,
  getCreatorEarnings,
  getCreatorUpcoming,
  getCreatorWeekOpen,
} from "@/lib/creator-studio";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayIndex(tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "weekday")?.value;
  return Math.max(0, DAY_LABELS.indexOf(wd ?? "Sun"));
}

function fmtTime(d: Date, tz: string): string {
  return d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}
function fmtDay(d: Date, tz: string): string {
  return d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
}
function countdown(d: Date): string {
  const ms = d.getTime() - Date.now();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  return `in ${Math.floor(hours / 24)} days`;
}

export default async function CreatorHomePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      is_published: creatorProfiles.is_published,
      stripe_account_id: creatorProfiles.stripe_account_id,
      bio: creatorProfiles.bio,
      banner_url: creatorProfiles.banner_url,
      category: creatorProfiles.category,
      slug: creatorProfiles.slug,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));

  const [userRow] = await db
    .select({
      display_name: users.display_name,
      avatar_url: users.avatar_url,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, user.id));
  const tz = userRow?.timezone ?? "UTC";

  // Reconcile both onboarding phases against Stripe on every load.
  let stripeOnboardingComplete = false;
  let identityVerified = false;
  if (profile) {
    const reconciled = await reconcileCreatorOnboarding(profile.id);
    stripeOnboardingComplete = reconciled.stripeOnboardingComplete;
    identityVerified = reconciled.identityVerified;
  }

  // -------------------------------------------------------------------------
  // Published → dashboard
  // -------------------------------------------------------------------------
  if (profile?.is_published) {
    const [ratingRow] = await db
      .select({
        avg: sql<number | null>`AVG(${reviews.rating})`,
        n: sql<number>`COUNT(*)`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.creator_id, profile.id),
          eq(reviews.reviewer_role, "guest"),
          eq(reviews.is_public, true),
          isNotNull(reviews.rating),
        ),
      );

    const [earnings, upcoming, weekOpen] = await Promise.all([
      getCreatorEarnings(profile.id),
      getCreatorUpcoming(profile.id),
      getCreatorWeekOpen(profile.id),
    ]);

    const rating = Number(ratingRow?.avg ?? 0);
    const reviewCount = Number(ratingRow?.n ?? 0);

    // Category pills — derived from active offerings (same as the public profile).
    const offeringCats = await db
      .select({ category: offerings.category })
      .from(offerings)
      .where(
        and(
          eq(offerings.creator_id, profile.id),
          eq(offerings.is_active, true),
          isNull(offerings.deleted_at),
        ),
      );
    const distinctCategories = Array.from(
      new Set(offeringCats.map((o) => o.category)),
    );
    const visibleCategories = distinctCategories.slice(0, 3);
    const extraCategories = Math.max(0, distinctCategories.length - 3);
    const categoryLabels = categoriesToLabelMap(await getCategories());

    return (
      <div>
        {/* Banner — only when the creator has one (mirrors the public profile) */}
        {profile.banner_url ? (
          <div className="relative">
            <img
              src={profile.banner_url}
              alt=""
              aria-hidden="true"
              className="h-36 w-full rounded-card object-cover"
            />
            <div className="absolute -bottom-8 left-6">
              <Avatar
                src={userRow?.avatar_url ?? null}
                name={userRow?.display_name ?? user.email ?? ""}
                size={72}
              />
            </div>
          </div>
        ) : null}

        {/* Identity: avatar (when no banner) + name */}
        <div
          className={`flex items-center gap-3 ${profile.banner_url ? "mt-10" : "mt-4"}`}
        >
          {!profile.banner_url && (
            <Avatar
              src={userRow?.avatar_url ?? null}
              name={userRow?.display_name ?? user.email ?? ""}
              size={48}
            />
          )}
          <h1 className="text-2xl font-bold text-white">
            {userRow?.display_name ?? user.email ?? ""}
          </h1>
          {profile.slug && (
            <ShareButton
              path={`/@${profile.slug}`}
              name={userRow?.display_name ?? user.email ?? ""}
            />
          )}
        </div>

        {/* Category pills (derived from active offerings) */}
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

        {/* Money strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="Total earned"
            value={formatCents(earnings.totalEarned)}
            hint="Your cut from every completed session."
          />
          <Kpi
            label="Pending"
            value={formatCents(earnings.pending)}
            hint="Earned but not yet paid out — on its way."
          />
          <Kpi
            label="Status"
            value={
              profile.is_published ? (
                <Badge variant="confirmed" label="Published" />
              ) : (
                <Badge variant="pending" label="Draft" />
              )
            }
            hint="Whether your profile is live (Published) or still a Draft."
          />
          <Kpi
            label="Rating"
            value={reviewCount > 0 ? <span className="text-rating">★ {rating.toFixed(1)}</span> : "—"}
            sub={reviewCount > 0 ? `${reviewCount} review${reviewCount === 1 ? "" : "s"}` : undefined}
            hint="Your average rating from public guest reviews."
          />
        </div>

        {/* Upcoming */}
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-white">Upcoming</h2>
            <Link href="/creator/bookings" className="text-sm text-text-secondary hover:text-white">
              View all →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <Card>
              <p className="text-sm text-text-secondary">
                No upcoming sessions yet.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((b) => (
                <Link key={b.id} href={`/bookings/${b.id}`}>
                  <Card className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {fmtTime(new Date(b.start_at!), tz)} –{" "}
                        {fmtTime(new Date(b.end_at!), tz)}
                        <span className="ml-2 font-normal text-text-secondary">
                          {fmtDay(new Date(b.start_at!), tz)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {b.guest} · {b.offering} · {b.duration} min
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-text-secondary">
                      {countdown(new Date(b.start_at!))}
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* This week */}
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-white">This week</h2>
          <div className="flex gap-2">
            {weekOpen.map((open, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-text-tertiary">{DAY_LABELS[i][0]}</span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                    open
                      ? "bg-live text-black"
                      : "border border-border-subtle bg-bg-card-hover text-text-secondary"
                  } ${i === todayIndex(tz) ? "ring-2 ring-white ring-offset-2 ring-offset-bg-base" : ""}`}
                >
                  {open ? "·" : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Not published → setup wizard (step 1 also covers "no profile yet")
  // -------------------------------------------------------------------------
  const categories = (await getCategories()).map((c) => ({
    value: c.slug,
    label: c.display_label,
  }));

  let offeringsList: {
    id: string;
    title: string;
    category: string;
    duration_minutes: number;
    price_cents: number;
    is_active: boolean;
    booking_count: number;
  }[] = [];
  let windowsList: { day_of_week: number; start_minute: number; end_minute: number }[] = [];
  let blocksList: { id: string; start_at: string; end_at: string }[] = [];
  let overridesList: { id: string; date: string; start_minute: number; end_minute: number }[] = [];

  if (profile) {
    const offeringRows = await db
      .select({
        id: offerings.id,
        title: offerings.title,
        category: offerings.category,
        duration_minutes: offerings.duration_minutes,
        price_cents: offerings.price_cents,
        is_active: offerings.is_active,
        booking_count: count(bookings.id),
      })
      .from(offerings)
      .leftJoin(bookings, eq(bookings.offering_id, offerings.id))
      .where(
        and(
          eq(offerings.creator_id, profile.id),
          isNull(offerings.deleted_at),
        ),
      )
      .groupBy(offerings.id)
      .orderBy(offerings.created_at);
    offeringsList = offeringRows.map((o) => ({
      ...o,
      booking_count: Number(o.booking_count),
    }));

    const [winRows, blockRows, overrideRows] = await Promise.all([
      db
        .select()
        .from(availabilityWindows)
        .where(eq(availabilityWindows.creator_id, profile.id))
        .orderBy(availabilityWindows.day_of_week, availabilityWindows.start_minute),
      db
        .select()
        .from(availabilityBlocks)
        .where(eq(availabilityBlocks.creator_id, profile.id))
        .orderBy(availabilityBlocks.start_at),
      db
        .select()
        .from(availabilityDateOverrides)
        .where(eq(availabilityDateOverrides.creator_id, profile.id))
        .orderBy(availabilityDateOverrides.date, availabilityDateOverrides.start_minute),
    ]);

    windowsList = winRows.map((w) => ({
      day_of_week: w.day_of_week,
      start_minute: w.start_minute,
      end_minute: w.end_minute,
    }));
    blocksList = blockRows.map((b) => ({
      id: b.id,
      start_at: b.start_at?.toISOString() ?? "",
      end_at: b.end_at?.toISOString() ?? "",
    }));
    overridesList = overrideRows.map((o) => ({
      id: o.id,
      date: String(o.date).slice(0, 10),
      start_minute: o.start_minute,
      end_minute: o.end_minute,
    }));
  }

  const hasActiveOffering = offeringsList.some((o) => o.is_active);
  const hasAvailability = windowsList.length > 0;

  // Derive the first incomplete step.
  let derivedStep = 1;
  if (profile) {
    if (!hasActiveOffering) derivedStep = 2;
    else if (!hasAvailability) derivedStep = 3;
    else if (!stripeOnboardingComplete) derivedStep = 4;
    else if (!identityVerified) derivedStep = 5;
    else derivedStep = 6; // everything done, just not published
  }

  const { step: rawStep } = await searchParams;
  // Resume at the last-visited step (set by the wizard) unless a ?step= is
  // explicitly given or nothing was recorded yet.
  const cookieStore = await cookies();
  const resumeStep = Number(cookieStore.get("onboarding_step")?.value) || 0;
  const requestedStep = Number(rawStep) || resumeStep || derivedStep;
  const step = Math.min(Math.max(requestedStep, 1), derivedStep);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Onboarding</h1>
      <div className="mt-6">
        <SetupWizard
          step={step}
          hasProfile={!!profile}
          profile={{
            existingBio: profile?.bio ?? "",
            avatarUrl: userRow?.avatar_url ?? null,
            bannerUrl: profile?.banner_url ?? null,
            displayName: userRow?.display_name ?? user.email ?? "",
          }}
          offerings={offeringsList}
          profileId={profile?.id ?? ""}
          profileCategory={profile?.category ?? categories[0]?.value ?? ""}
          categories={categories}
          availability={{
            windows: windowsList,
            blocks: blocksList,
            overrides: overridesList,
            timezone: tz,
          }}
          hasStripeAccount={!!profile?.stripe_account_id}
        />
      </div>
    </div>
  );
}
