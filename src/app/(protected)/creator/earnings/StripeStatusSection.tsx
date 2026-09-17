"use client";

import { useState } from "react";
import {
  startStripeOnboarding,
  startIdentityVerification,
  createStripeDashboardLink,
} from "../actions";
import { Button } from "@/components/ui/Button";
import { STRIPE_EXPRESS_COUNTRIES } from "@/lib/stripe-countries";
import type { StripeStatus } from "@/lib/deferred-onboarding";

export function StripeStatusSection({ status }: { status: StripeStatus }) {
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

  const handleResume = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await startStripeOnboarding("US");
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

  const handleManage = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await createStripeDashboardLink();
      if (result && "error" in result) {
        setError(result.error ?? "");
        setBusy(false);
      } else if (result && "url" in result) {
        window.open(result.url, "_blank");
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-card bg-bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          Bank account
        </h2>
        <StatusPill status={status} />
      </div>

      {error && <p className="mt-2 text-xs text-error">{error}</p>}

      {status.kind === "not_connected" && (
        <>
          <p className="mt-2 text-xs text-text-secondary">
            Connect your bank account so you can receive payouts. Takes about 2
            minutes.
          </p>
          {showCountry ? (
            <div className="mt-3 flex items-end gap-3">
              <div className="flex-1">
                <label
                  htmlFor="stripe-country"
                  className="mb-1 block text-xs text-text-secondary"
                >
                  Country
                </label>
                <select
                  id="stripe-country"
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
        </>
      )}

      {status.kind === "incomplete" && (
        <>
          <p className="mt-2 text-xs text-text-secondary">
            You started connecting your bank account but didn&apos;t finish.
            Pick up where you left off.
          </p>
          <Button
            size="small"
            className="mt-3"
            onClick={handleResume}
            disabled={busy}
          >
            {busy ? "Redirecting…" : "Continue Setup"}
          </Button>
        </>
      )}

      {status.kind === "verify" && (
        <>
          <p className="mt-2 text-xs text-text-secondary">
            Your bank details are saved. Complete identity verification to start
            receiving payouts.
          </p>
          <Button
            size="small"
            className="mt-3"
            onClick={handleVerify}
            disabled={busy}
          >
            {busy ? "Redirecting…" : "Complete Verification"}
          </Button>
        </>
      )}

      {status.kind === "connected" && (
        <>
          <p className="mt-2 text-xs text-text-secondary">
            Your bank account is connected and payouts are enabled. You can
            manage your account details, view payout history, and update your
            bank on Stripe.
          </p>
          <Button
            size="small"
            variant="secondary"
            className="mt-3"
            onClick={handleManage}
            disabled={busy}
          >
            {busy ? "Opening…" : "Manage on Stripe"}
          </Button>
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: StripeStatus }) {
  switch (status.kind) {
    case "connected":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-live/10 px-2.5 py-1 text-xs font-semibold text-live">
          <span className="h-1.5 w-1.5 rounded-full bg-live" />
          Connected
        </span>
      );
    case "verify":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-rating/10 px-2.5 py-1 text-xs font-semibold text-rating">
          <span className="h-1.5 w-1.5 rounded-full bg-rating" />
          Verification needed
        </span>
      );
    case "incomplete":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-rating/10 px-2.5 py-1 text-xs font-semibold text-rating">
          <span className="h-1.5 w-1.5 rounded-full bg-rating" />
          Incomplete
        </span>
      );
    case "not_connected":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-text-secondary/10 px-2.5 py-1 text-xs font-semibold text-text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-text-secondary" />
          Not connected
        </span>
      );
  }
}
