import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { creatorProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { formatCents, getCreatorEarnings } from "@/lib/creator-studio";
import { reconcileCreatorOnboarding } from "@/lib/creator-onboarding";
import { getStripeBannerState } from "@/lib/deferred-onboarding";
import { StripeConnectBanner } from "../StripeConnectBanner";
import { EarningsList } from "./EarningsList";

export default async function CreatorEarningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      stripe_account_id: creatorProfiles.stripe_account_id,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));

  if (!profile) {
    return <p className="text-sm text-text-secondary">Create your profile first.</p>;
  }

  const [userRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, user.id));
  const tz = userRow?.timezone ?? "UTC";

  const reconciled = await reconcileCreatorOnboarding(profile.id);
  const earnings = await getCreatorEarnings(profile.id);

  const serializedSessions = earnings.sessions.map((s) => ({
    ...s,
    startAtIso: s.startAt ? s.startAt.toISOString() : null,
    endAtIso: s.endAt ? s.endAt.toISOString() : null,
    paysAtIso: s.paysAt ? s.paysAt.toISOString() : null,
    startAt: null as Date | null,
    endAt: null as Date | null,
    paysAt: null as Date | null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">Earnings</h1>

      {(() => {
        const banner = getStripeBannerState({
          stripeAccountId: profile.stripe_account_id,
          stripeOnboardingComplete: reconciled.stripeOnboardingComplete,
          identityVerified: reconciled.identityVerified,
          pendingCents: earnings.pending,
        });
        return banner ? <StripeConnectBanner state={banner} /> : null;
      })()}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          label="Paid out"
          value={formatCents(earnings.paidOut)}
          hint="Already transferred to your connected Stripe account."
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Sessions</h2>
        {earnings.sessions.length === 0 ? (
          <Card>
            <p className="text-sm text-text-secondary">
              No completed sessions yet. Earnings appear here after your first session.
            </p>
          </Card>
        ) : (
          <EarningsList
            sessions={serializedSessions}
            platformFeeRate={earnings.platformFeeRate}
            timezone={tz}
          />
        )}
      </section>
    </div>
  );
}
