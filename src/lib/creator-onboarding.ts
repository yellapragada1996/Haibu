import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";

export type ConnectRequirements = {
  currently_due: string[];
  eventually_due: string[];
  pending_verification: string[];
};

export type ConnectStatus = {
  payouts_enabled: boolean;
  charges_enabled: boolean;
  requirements: ConnectRequirements | null;
};

export type ReconcileResult = {
  stripeOnboardingComplete: boolean;
  identityVerified: boolean;
  connect: ConnectStatus | null;
};

const IDENTITY_PREFIX = "individual.verification";
const isIdentityCode = (code: string): boolean =>
  code.startsWith(IDENTITY_PREFIX);

/**
 * Reconcile a creator's two onboarding flags against Stripe's real state.
 *
 * Stripe Connect Express splits onboarding into two phases:
 *   1. Business/bank details (business_type, external_account, tos_acceptance).
 *   2. Identity verification (individual.verification.*, i.e. document/selfie).
 *
 * `stripe_onboarding_complete` tracks phase 1 (business/bank done).
 * `identity_verified` tracks phase 2 (identity done).
 * Both are derived from `requirements.currently_due`, not just payouts_enabled,
 * so each UI step flips as soon as the user finishes that phase.
 */
export async function reconcileCreatorOnboarding(
  profileId: string,
): Promise<ReconcileResult> {
  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId));
  if (!profile) {
    return {
      stripeOnboardingComplete: false,
      identityVerified: false,
      connect: null,
    };
  }

  let stripeOnboardingComplete = profile.stripe_onboarding_complete;
  let identityVerified = profile.identity_verified;
  let connect: ConnectStatus | null = null;

  if (profile.stripe_account_id) {
    try {
      const account = await stripe.accounts.retrieve(profile.stripe_account_id);
      const due = account.requirements?.currently_due ?? [];
      connect = {
        payouts_enabled: account.payouts_enabled === true,
        charges_enabled: account.charges_enabled === true,
        requirements: {
          currently_due: due,
          eventually_due: account.requirements?.eventually_due ?? [],
          pending_verification:
            account.requirements?.pending_verification ?? [],
        },
      };

      // Phase 1 done when every remaining requirement is identity-related
      // (i.e. business/bank requirements are cleared).
      const businessBankDone = due.every(isIdentityCode);
      // Phase 2 done when no identity requirement remains. payouts_enabled is
      // an explicit "everything is approved" signal and short-circuits review lag.
      const identityDone =
        account.payouts_enabled === true ||
        (businessBankDone && !due.some(isIdentityCode));

      if (
        businessBankDone !== stripeOnboardingComplete ||
        identityDone !== identityVerified
      ) {
        await db
          .update(creatorProfiles)
          .set({
            stripe_onboarding_complete: businessBankDone,
            identity_verified: identityDone,
          })
          .where(eq(creatorProfiles.id, profileId));
        stripeOnboardingComplete = businessBankDone;
        identityVerified = identityDone;
      }
    } catch {
      // Fall back to the stored flags on a transient Stripe error.
    }
  }

  return { stripeOnboardingComplete, identityVerified, connect };
}
