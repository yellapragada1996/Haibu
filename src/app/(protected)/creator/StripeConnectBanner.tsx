"use client";

import { useState } from "react";
import { startStripeOnboarding, startIdentityVerification } from "./actions";
import { Button } from "@/components/ui/Button";
import { STRIPE_EXPRESS_COUNTRIES } from "@/lib/stripe-countries";
import { formatCents } from "@/lib/creator-studio";

type BannerState =
  | { kind: "connect"; pendingCents: number }
  | { kind: "verify" };

export function StripeConnectBanner({ state }: { state: BannerState }) {
  const [country, setCountry] = useState("US");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCountry, setShowCountry] = useState(false);

  const handleConnect = async () => {
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
  };

  const handleVerify = async () => {
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
  };

  if (state.kind === "verify") {
    return (
      <div className="mt-5 rounded-card border border-live/20 bg-live/5 p-4">
        <p className="text-sm font-semibold text-live">
          Almost there — finish verification
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Your bank details are saved. Complete identity verification to start
          receiving payouts.
        </p>
        {error && <p className="mt-2 text-xs text-error">{error}</p>}
        <Button
          size="small"
          className="mt-3"
          onClick={handleVerify}
          disabled={busy}
        >
          {busy ? "Redirecting…" : "Complete Verification"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-card border border-live/20 bg-live/5 p-4">
      <p className="text-sm font-semibold text-live">
        You&apos;ve earned {formatCents(state.pendingCents)}!
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        Connect your bank account to receive payouts. Takes about 2 minutes.
      </p>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}

      {showCountry ? (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label
              htmlFor="banner-country"
              className="mb-1 block text-xs text-text-secondary"
            >
              Country
            </label>
            <select
              id="banner-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="h-9 w-full rounded-input border border-border-subtle bg-bg-base px-3 text-sm text-text-primary outline-none focus:border-primary"
            >
              {STRIPE_EXPRESS_COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Button size="small" onClick={handleConnect} disabled={busy}>
            {busy ? "Redirecting…" : "Connect"}
          </Button>
        </div>
      ) : (
        <Button
          size="small"
          className="mt-3"
          onClick={() => setShowCountry(true)}
          disabled={busy}
        >
          Connect Bank Account
        </Button>
      )}
    </div>
  );
}
