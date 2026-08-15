"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  upsertCreatorProfile,
  startStripeOnboarding,
  checkOnboardingStatus,
  startIdentityVerification,
  setPublishedStatus,
  removeBanner,
} from "../actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ImageUpload } from "@/components/ImageUpload";
import { uploadImage } from "@/lib/imageUpload";

const countries = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
];

export function ProfileForm({
  existingBio,
  hasProfile,
  stripeAccountId,
  stripeOnboardingComplete,
  identityVerified,
  isPublished,
  avatarUrl,
  bannerUrl,
  displayName,
}: {
  existingBio: string;
  hasProfile: boolean;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  identityVerified: boolean;
  isPublished: boolean;
  avatarUrl: string | null;
  bannerUrl: string | null;
  displayName: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<{
    charges_enabled: boolean;
    payouts_enabled: boolean;
  } | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [country, setCountry] = useState("US");
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [stagedAvatar, setStagedAvatar] = useState<File | null>(null);
  const [stagedBanner, setStagedBanner] = useState<File | null>(null);

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Capture the form element synchronously — React releases synthetic
    // events after the handler's synchronous phase, so e.currentTarget is
    // null after any await.
    const form = e.currentTarget;
    setSaveState("saving");
    setError(null);

    // Staged images persist together with the other fields.
    try {
      if (stagedAvatar) await uploadImage("avatar", stagedAvatar);
      if (stagedBanner) await uploadImage("banner", stagedBanner);
    } catch (uploadErr) {
      setError(uploadErr instanceof Error ? uploadErr.message : "Upload failed");
      setSaveState("idle");
      return;
    }

    const formData = new FormData(form);
    const result = await upsertCreatorProfile(formData);
    if (result && "error" in result) {
      setError((result as { error: string }).error);
      setSaveState("idle");
    } else {
      setStagedAvatar(null);
      setStagedBanner(null);
      setSaveState("saved");
      router.refresh();
    }
  };

  const isReturn = searchParams.get("onboarding") === "return";
  if (isReturn && !onboardingStatus) {
    checkOnboardingStatus().then((s) => setOnboardingStatus(s));
  }

  const handleStartOnboarding = useCallback(async () => {
    setOnboardingLoading(true);
    setError(null);
    const result = await startStripeOnboarding(country);
    if (result && "error" in result) {
      setError(result.error ?? "");
      setOnboardingLoading(false);
    } else if (result && "url" in result) {
      router.push(result.url);
    }
  }, [country, router]);

  const handleStartIdentity = useCallback(async () => {
    setIdentityLoading(true);
    setError(null);
    const result = await startIdentityVerification();
    if (result && "error" in result) {
      setError(result.error ?? "");
      setIdentityLoading(false);
    } else if (result && "url" in result) {
      router.push(result.url!);
    }
  }, [router]);

  const togglePublished = useCallback(async () => {
    const result = await setPublishedStatus(!isPublished);
    if (result && "error" in result) {
      setError(result.error ?? "");
    }
  }, [isPublished]);

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Profile fields */}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Bio
          </label>
          <textarea
            name="bio"
            defaultValue={existingBio}
            rows={4}
            placeholder="Tell fans about yourself and your sessions..."
            className="w-full bg-bg-base border border-border-subtle outline-none rounded-input px-4 py-3 text-sm text-white placeholder-text-secondary transition-colors focus:border-accent resize-none"
          />
        </div>

        <div>
          <ImageUpload
            purpose="avatar"
            currentUrl={avatarUrl}
            label="Avatar"
            nameFallback={displayName}
            onStagedFile={setStagedAvatar}
          />
        </div>

        <div>
          <ImageUpload
            purpose="banner"
            currentUrl={bannerUrl}
            label="Banner image"
            nameFallback={displayName}
            onStagedFile={setStagedBanner}
            onRemove={async () => {
              await removeBanner();
            }}
          />
        </div>

        <Button type="submit" disabled={saveState !== "idle"}>
          {saveState === "saving"
            ? "Updating..."
            : saveState === "saved"
              ? "Updated ✓"
              : hasProfile
                ? "Update profile"
                : "Create profile"}
        </Button>
      </div>

      {/* Stripe Connect */}
      <hr className="border-border-subtle" />
      <h2 className="text-lg font-semibold text-white">Payments</h2>

      {stripeOnboardingComplete ? (
        <Card>
          <div className="flex items-center gap-2">
            <Badge variant="confirmed" label="Connected" />
            <span className="text-sm text-white">Stripe connected</span>
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            Account: {stripeAccountId?.slice(-8)}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            Managed by Stripe. To update, edit your account directly on Stripe.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="mb-3">
            <Badge variant="pending" label="Pending" />
          </div>
          <p className="mb-3 text-sm text-text-secondary">
            Connect a Stripe account to receive payouts from bookings. You&apos;ll
            be redirected to Stripe&apos;s secure onboarding.
          </p>

          {isReturn && onboardingStatus && (
            <div className="mb-3 rounded-input bg-bg-base p-3">
              <p className="text-sm text-live-green">
                {onboardingStatus.charges_enabled && onboardingStatus.payouts_enabled
                  ? "All set! Your account is ready."
                  : "Still processing — this may take a moment."}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-auto"
            >
              {countries.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              onClick={handleStartOnboarding}
              disabled={onboardingLoading}
            >
              {onboardingLoading ? "Redirecting..." : "Set up payments"}
            </Button>
          </div>
        </Card>
      )}

      {/* Identity Verification */}
      <hr className="border-border-subtle" />
      <h2 className="text-lg font-semibold text-white">Identity Verification</h2>

      {!stripeOnboardingComplete ? (
        <p className="text-sm text-text-secondary">
          Complete Stripe onboarding above before verifying your identity.
        </p>
      ) : identityVerified ? (
        <Card>
          <div className="flex items-center gap-2">
            <Badge variant="confirmed" label="Verified" />
            <span className="text-sm text-white">Identity verified</span>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="mb-3">
            <Badge variant="pending" label="Pending" />
          </div>
          <p className="mb-3 text-sm text-text-secondary">
            Haibu requires identity verification for all creators. You&apos;ll
            be redirected to Stripe&apos;s secure verification flow.
          </p>
          <Button
            type="button"
            onClick={handleStartIdentity}
            disabled={identityLoading}
          >
            {identityLoading ? "Redirecting..." : "Verify identity"}
          </Button>
        </Card>
      )}

      {/* Publish profile */}
      <hr className="border-border-subtle" />
      <h2 className="text-lg font-semibold text-white">Publish profile</h2>

      {!stripeOnboardingComplete || !identityVerified ? (
        <p className="text-sm text-text-secondary">
          Complete payments setup and identity verification before publishing.
        </p>
      ) : (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">
                {isPublished ? "Published" : "Draft"}
              </p>
              <p className="text-xs text-text-secondary">
                {isPublished
                  ? "Guests can find and book sessions with you."
                  : "Toggle on to appear in search results."}
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={togglePublished}
                className="peer sr-only"
              />
              <div className="h-6 w-11 rounded-pill bg-bg-card-hover after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-live-green peer-checked:after:translate-x-full" />
            </label>
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-error">{error}</p>}
    </form>
  );
}
