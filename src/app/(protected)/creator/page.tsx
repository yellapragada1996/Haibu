import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { creatorProfiles, reviews, users } from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Kpi } from "@/components/ui/Kpi";
import {
  formatCents,
  getCreatorAttention,
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
export default async function CreatorHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      is_published: creatorProfiles.is_published,
      stripe_onboarding_complete: creatorProfiles.stripe_onboarding_complete,
      identity_verified: creatorProfiles.identity_verified,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <p className="text-lg font-semibold text-white">Become a creator</p>
        <p className="mt-2 text-sm text-text-secondary">
          Set up your creator profile to start earning from live sessions.
        </p>
        <div className="mt-6">
          <ButtonLink href="/creator/profile">Create your profile</ButtonLink>
        </div>
      </div>
    );
  }

  const [userRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, user.id));
  const tz = userRow?.timezone ?? "UTC";

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

  const [earnings, upcoming, attention, weekOpen] = await Promise.all([
    getCreatorEarnings(profile.id),
    getCreatorUpcoming(profile.id),
    getCreatorAttention(profile.id, {
      stripeOnboardingComplete: profile.stripe_onboarding_complete,
      identityVerified: profile.identity_verified,
      isPublished: profile.is_published,
    }),
    getCreatorWeekOpen(profile.id),
  ]);

  const rating = Number(ratingRow?.avg ?? 0);
  const reviewCount = Number(ratingRow?.n ?? 0);

  const onboardingItems = [
    { label: "Add an offering", done: attention.onboarding.offeringsDone, href: "/creator/offerings" },
    { label: "Set availability", done: attention.onboarding.availabilityDone, href: "/creator/availability" },
    { label: "Connect payments", done: attention.onboarding.paymentsDone, href: "/creator/profile" },
    { label: "Verify identity", done: attention.onboarding.identityDone, href: "/creator/profile" },
  ];
  const pendingSteps = onboardingItems.filter((i) => !i.done);
  const readyToPublish =
    profile.stripe_onboarding_complete && profile.identity_verified;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Overview</h1>

      {/* New creator: onboarding checklist as the hero */}
      {!profile.is_published && (
        <Card className="mt-6 space-y-1">
          <p className="text-sm font-semibold text-white">
            {readyToPublish
              ? "Ready to go live"
              : `Go live in ${pendingSteps.length} step${pendingSteps.length === 1 ? "" : "s"}`}
          </p>
          <p className="text-xs text-text-secondary">
            {readyToPublish
              ? "Everything is set — toggle Publish on your Profile tab."
              : "Finish setup to appear in search and start earning."}
          </p>
          <ul className="pt-2">
            {onboardingItems.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center gap-3 rounded-input px-2 text-sm text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span
                    aria-hidden="true"
                    className={`text-base ${item.done ? "text-live" : "text-text-tertiary"}`}
                  >
                    {item.done ? "✓" : "·"}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
          <div className="space-y-2">
            {upcoming.map((b) => (
              <Card key={b.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {fmtTime(new Date(b.start_at!), tz)}
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
