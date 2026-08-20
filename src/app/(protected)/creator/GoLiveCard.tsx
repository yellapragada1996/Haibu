"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  startStripeOnboarding,
  checkOnboardingStatus,
  startIdentityVerification,
  setPublishedStatus,
} from "./actions";
import { Button } from "@/components/ui/Button";
import { STRIPE_EXPRESS_COUNTRIES } from "@/lib/stripe-countries";

export function GoLiveCard({
  offeringsDone,
  availabilityDone,
  paymentsDone,
  identityDone,
  isPublished,
  hasStripeAccount,
}: {
  offeringsDone: boolean;
  availabilityDone: boolean;
  paymentsDone: boolean;
  identityDone: boolean;
  isPublished: boolean;
  hasStripeAccount: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [country, setCountry] = useState("US");
  const [error, setError] = useState<string | null>(null);

  const isReturn = searchParams.get("onboarding") === "return";
  const isRefresh = searchParams.get("onboarding") === "refresh";

  // refresh_url — re-create the account link and bounce straight back into
  // onboarding so a refresh/back never dead-ends.
  useEffect(() => {
    if (!isRefresh) return;
    let cancelled = false;
    (async () => {
      const result = await startStripeOnboarding("US");
      if (cancelled) return;
      if (result && "url" in result) {
        window.location.href = result.url!;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isRefresh]);

  // return_url — reconcile against Stripe, then strip the query param and
  // re-render so the step list reflects the phase just completed. A short poll
  // absorbs Stripe's async verification-review lag.
  useEffect(() => {
    if (!isReturn) return;
    let cancelled = false;
    let attempts = 0;
    const check = async () => {
      try {
        const status = await checkOnboardingStatus();
        if (cancelled) return;
        attempts += 1;
        const progressed =
          status.stripe_onboarding_complete ||
          status.identity_verified ||
          status.payouts_enabled;
        if (progressed || attempts >= 3) {
          router.replace("/creator");
          return;
        }
        setTimeout(check, 2000);
      } catch {
        if (!cancelled) router.replace("/creator");
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [isReturn, router]);

  const handleStartOnboarding = useCallback(async () => {
    setOnboardingLoading(true);
    setError(null);
    try {
      const result = await startStripeOnboarding(country);
      if (result && "error" in result) {
        setError(result.error ?? "");
      } else if (result && "url" in result) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setOnboardingLoading(false);
    }
  }, [country]);

  const handleStartIdentity = useCallback(async () => {
    setIdentityLoading(true);
    setError(null);
    try {
      const result = await startIdentityVerification();
      if (result && "error" in result) {
        setError(result.error ?? "");
      } else if (result && "url" in result && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIdentityLoading(false);
    }
  }, []);

  const handlePublish = useCallback(async () => {
    setPublishLoading(true);
    setError(null);
    const result = await setPublishedStatus(true);
    setPublishLoading(false);
    if (result && "error" in result) {
      setError(result.error ?? "");
    } else {
      router.refresh();
    }
  }, [router]);

  const canPublish =
    offeringsDone && availabilityDone && paymentsDone && identityDone;

  const steps: {
    label: string;
    why: string;
    done: boolean;
    required: boolean;
    cta: React.ReactNode;
  }[] = [
    {
      label: "Add an offering",
      why: "What fans will book",
      done: offeringsDone,
      required: false,
      cta: (
        <Link
          href="/creator/offerings"
          className="inline-flex h-9 w-full items-center justify-center rounded-pill border border-border-subtle bg-neutral-default px-4 text-sm font-semibold text-white transition-colors hover:bg-neutral-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
        >
          Add offering
        </Link>
      ),
    },
    {
      label: "Set availability",
      why: "When fans can book you",
      done: availabilityDone,
      required: false,
      cta: (
        <Link
          href="/creator/availability"
          className="inline-flex h-9 w-full items-center justify-center rounded-pill border border-border-subtle bg-neutral-default px-4 text-sm font-semibold text-white transition-colors hover:bg-neutral-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
        >
          Set hours
        </Link>
      ),
    },
    {
      label: "Connect payments",
      why: "Add your bank and business details to receive payouts",
      done: paymentsDone,
      required: true,
      cta: (
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          {!hasStripeAccount && (
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-label="Country"
              className="h-9 w-full rounded-input border border-border-subtle bg-bg-base px-2 text-sm text-white outline-none focus:border-primary sm:w-auto"
            >
              {STRIPE_EXPRESS_COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          <Button
            size="small"
            type="button"
            className="w-full sm:w-auto"
            onClick={handleStartOnboarding}
            disabled={onboardingLoading}
          >
            {onboardingLoading
              ? "Redirecting…"
              : hasStripeAccount
                ? "Continue onboarding"
                : "Connect Stripe"}
          </Button>
        </div>
      ),
    },
    {
      label: "Verify identity",
      why: "Confirm who you are before going live",
      done: identityDone,
      required: true,
      cta: paymentsDone ? (
        <Button
          size="small"
          type="button"
          className="w-full sm:w-auto"
          onClick={handleStartIdentity}
          disabled={identityLoading}
        >
          {identityLoading ? "Redirecting…" : "Verify identity"}
        </Button>
      ) : (
        <span className="text-xs text-text-tertiary">
          Complete payments first
        </span>
      ),
    },
    {
      label: "Publish profile",
      why: "Makes you visible in search",
      done: isPublished,
      required: true,
      cta: (
        <Button
          size="small"
          type="button"
          className="w-full sm:w-auto"
          onClick={handlePublish}
          disabled={publishLoading || !canPublish}
        >
          {publishLoading ? "Publishing…" : "Publish"}
        </Button>
      ),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-card bg-bg-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Go live</h2>
        <span className="text-xs text-text-secondary">
          {doneCount} of {steps.length} complete
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        aria-label="Go live progress"
        className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-bg-card-hover"
      >
        <div
          className="h-full rounded-pill bg-live transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-text-tertiary">
        Complete these to start earning.
      </p>

      <ol className="mt-3">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className="border-t border-border-subtle first:border-t-0"
          >
            <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-3 sm:min-w-0 sm:flex-1">
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.done
                      ? "bg-live text-black"
                      : "border border-border-subtle text-text-tertiary"
                  }`}
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-white">
                    <span>{step.label}</span>
                    {step.required && (
                      <span className="rounded-pill border border-error px-1.5 py-px text-[9px] font-bold leading-none text-error">
                        REQUIRED
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">{step.why}</p>
                </div>
              </div>
              <div className="sm:shrink-0">
                {step.done ? (
                  <span className="text-xs font-semibold text-live">Done</span>
                ) : (
                  step.cta
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}
    </div>
  );
}
