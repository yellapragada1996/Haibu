"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileForm } from "./profile/ProfileForm";
import {
  WizardOfferingStep,
  type WizardOfferingStepHandle,
} from "./WizardOfferingStep";
import {
  AvailabilityManager,
  type AvailabilityManagerHandle,
} from "./availability/AvailabilityManager";
import {
  startStripeOnboarding,
  startIdentityVerification,
  setPublishedStatus,
} from "./actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { STRIPE_EXPRESS_COUNTRIES } from "@/lib/stripe-countries";

type CategoryOption = { value: string; label: string };

type Offering = {
  id: string;
  title: string;
  category: string;
  duration_minutes: number;
  price_cents: number;
  is_active: boolean;
  booking_count: number;
};

const STEPS = [
  "Profile",
  "Offering",
  "Availability",
  "Payments",
  "Identity",
  "Publish",
];

export function SetupWizard({
  step,
  hasProfile,
  profile,
  offerings,
  profileId,
  profileCategory,
  categories,
  availability,
  hasStripeAccount,
}: {
  step: number;
  hasProfile: boolean;
  profile: {
    existingBio: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    displayName: string;
  };
  offerings: Offering[];
  profileId: string;
  profileCategory: string;
  categories: CategoryOption[];
  availability: {
    windows: { day_of_week: number; start_minute: number; end_minute: number }[];
    blocks: { id: string; start_at: string; end_at: string }[];
    overrides: { id: string; date: string; start_minute: number; end_minute: number }[];
    timezone: string;
  };
  hasStripeAccount: boolean;
}) {
  const router = useRouter();
  const availRef = useRef<AvailabilityManagerHandle>(null);
  const offeringRef = useRef<WizardOfferingStepHandle>(null);
  const [country, setCountry] = useState("US");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goTo = useCallback(
    (target: number) => router.replace(`/creator?step=${target}`),
    [router],
  );
  const next = useCallback(() => goTo(step + 1), [goTo, step]);

  // "Save & exit" vs "Continue" share the same save flow; this ref records which
  // one the user picked so the post-save callback can route correctly.
  const exitRef = useRef(false);
  const handleDone = useCallback(() => {
    if (exitRef.current) {
      exitRef.current = false;
      router.replace("/");
    } else {
      next();
    }
  }, [exitRef, next, router]);

  const handleConnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await startStripeOnboarding(country);
      if (result && "error" in result) {
        setError(result.error ?? "");
        setBusy(false);
      } else if (result && "url" in result) {
        window.location.href = result.url;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }, [country]);

  const handleVerify = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await startIdentityVerification();
      if (result && "error" in result) {
        setError(result.error ?? "");
        setBusy(false);
      } else if (result && "url" in result && result.url) {
        window.location.href = result.url;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }, []);

  const handlePublish = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await setPublishedStatus(true);
    setBusy(false);
    if (result && "error" in result) {
      setError(result.error ?? "");
    } else {
      router.replace("/creator");
    }
  }, [router]);

  const stepName = STEPS[step - 1] ?? "";

  // Remember the current step so a later "Save & exit" → Dashboard resumes here.
  useEffect(() => {
    document.cookie = `onboarding_step=${step}; path=/; max-age=2592000; samesite=lax`;
  }, [step]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-card bg-bg-card p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Become a creator</h2>
          {step === 1 && (
            <Button
              variant="secondary"
              size="small"
              type="submit"
              form="setup-profile-form"
              onClick={() => {
                exitRef.current = true;
              }}
            >
              Save &amp; exit
            </Button>
          )}
          {step === 2 && (
            <Button
              variant="secondary"
              size="small"
              type="button"
              onClick={() => {
                exitRef.current = true;
                offeringRef.current?.submit();
              }}
            >
              Save &amp; exit
            </Button>
          )}
          {step === 3 && (
            <Button
              variant="secondary"
              size="small"
              type="button"
              onClick={() => {
                exitRef.current = true;
                availRef.current?.save();
              }}
            >
              Save &amp; exit
            </Button>
          )}
          {step >= 4 && (
            <ButtonLink href="/" variant="secondary" size="small">
              Save &amp; exit
            </ButtonLink>
          )}
        </div>

        {/* Progress — single continuous line (desktop + mobile) */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-text-secondary">{stepName}</span>
            <span className="text-text-tertiary">
              Step {step} of {STEPS.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-bg-card-hover">
            <div
              className="h-full rounded-pill bg-live transition-all"
              style={{ width: `${(step / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Step body */}
        <div className="mt-6">
          {step === 1 && (
            <ProfileForm
              formId="setup-profile-form"
              hideSubmit
              onComplete={handleDone}
              existingBio={profile.existingBio}
              hasProfile={hasProfile}
              avatarUrl={profile.avatarUrl}
              bannerUrl={profile.bannerUrl}
              displayName={profile.displayName}
            />
          )}

          {step === 2 && (
            <WizardOfferingStep
              ref={offeringRef}
              existing={offerings.map((o) => ({
                id: o.id,
                title: o.title,
                category: o.category,
                duration_minutes: o.duration_minutes,
                price_cents: o.price_cents,
              }))}
              categories={categories}
              profileCategory={profileCategory}
              onSaved={handleDone}
            />
          )}

          {step === 3 && (
            <AvailabilityManager
              ref={availRef}
              windows={availability.windows}
              blocks={availability.blocks}
              overrides={availability.overrides}
              timezone={availability.timezone}
              hideSubmit
              onSaved={handleDone}
            />
          )}

          {step === 4 && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-bg-card-hover text-xl text-text-secondary">
                $
              </div>
              <h3 className="text-base font-semibold text-text-primary">
                Connect your payout account
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
                Add your business and bank details on Stripe so you can receive
                payouts. Takes about 2 minutes.
              </p>
              {!hasStripeAccount && (
                <div className="mx-auto mt-4 flex max-w-xs flex-col gap-2">
                  <label
                    htmlFor="setup-country"
                    className="text-left text-xs text-text-secondary"
                  >
                    Country
                  </label>
                  <select
                    id="setup-country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="h-10 w-full rounded-input border border-border-subtle bg-bg-base px-3 text-sm text-text-primary outline-none focus:border-primary"
                  >
                    {STRIPE_EXPRESS_COUNTRIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="mt-4 text-xs text-text-tertiary">
                You'll be redirected back when done
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-bg-card-hover text-sm font-bold text-text-secondary">
                ID
              </div>
              <h3 className="text-base font-semibold text-text-primary">
                Verify your identity
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
                Confirm who you are with a quick ID + selfie check. This is
                required before you can go live.
              </p>
              <p className="mt-4 text-xs text-text-tertiary">
                You'll be redirected back when done
              </p>
            </div>
          )}

          {step === 6 && (
            <div>
              <div className="overflow-hidden rounded-input border border-border-subtle">
                {[
                  "Profile",
                  `Offering — ${offerings[0]?.title ?? "None yet"}`,
                  "Availability",
                  "Payments — connected",
                  "Identity — verified",
                ].map((label) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 text-sm last:border-b-0"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-live text-xs font-bold text-black">
                      ✓
                    </span>
                    <span className="text-text-secondary">{label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-text-secondary">
                Going live makes you visible in search. You can pause or edit
                anytime.
              </p>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-error">{error}</p>}

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
          {step > 1 ? (
            <Button variant="ghost" size="small" onClick={() => goTo(step - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}

          {step === 1 && (
            <Button type="submit" form="setup-profile-form">
              Continue
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => offeringRef.current?.submit()}>Continue</Button>
          )}
          {step === 3 && (
            <Button onClick={() => availRef.current?.save()}>Continue</Button>
          )}
          {step === 4 && (
            <Button onClick={handleConnect} disabled={busy}>
              {busy
                ? "Redirecting…"
                : hasStripeAccount
                  ? "Continue onboarding"
                  : "Connect Stripe"}
            </Button>
          )}
          {step === 5 && (
            <Button onClick={handleVerify} disabled={busy}>
              {busy ? "Redirecting…" : "Verify identity"}
            </Button>
          )}
          {step === 6 && (
            <Button onClick={handlePublish} disabled={busy}>
              {busy ? "Publishing…" : "Go live"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
