import { describe, it, expect } from "vitest";
import {
  getStripeBannerState,
  canPublishWithoutStripe,
} from "./deferred-onboarding";

describe("getStripeBannerState", () => {
  it("returns null when creator has no Stripe and no earnings", () => {
    expect(
      getStripeBannerState({
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        identityVerified: false,
        pendingCents: 0,
      }),
    ).toBeNull();
  });

  it("returns 'connect' when creator has no Stripe but has earnings", () => {
    const result = getStripeBannerState({
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      identityVerified: false,
      pendingCents: 2500,
    });
    expect(result).toEqual({ kind: "connect", pendingCents: 2500 });
  });

  it("returns 'verify' when business/bank done but identity not verified", () => {
    const result = getStripeBannerState({
      stripeAccountId: "acct_123",
      stripeOnboardingComplete: true,
      identityVerified: false,
      pendingCents: 5000,
    });
    expect(result).toEqual({ kind: "verify" });
  });

  it("returns null when fully onboarded", () => {
    expect(
      getStripeBannerState({
        stripeAccountId: "acct_123",
        stripeOnboardingComplete: true,
        identityVerified: true,
        pendingCents: 5000,
      }),
    ).toBeNull();
  });

  it("returns null when Stripe account exists but onboarding not complete and no earnings", () => {
    expect(
      getStripeBannerState({
        stripeAccountId: "acct_123",
        stripeOnboardingComplete: false,
        identityVerified: false,
        pendingCents: 0,
      }),
    ).toBeNull();
  });

  it("returns null when Stripe account exists, onboarding not complete, has earnings", () => {
    // Creator started Stripe but didn't finish business/bank — they have an account
    // but onboarding isn't marked complete. Don't show "connect" since they already
    // have an account; don't show "verify" since business/bank isn't done yet.
    expect(
      getStripeBannerState({
        stripeAccountId: "acct_123",
        stripeOnboardingComplete: false,
        identityVerified: false,
        pendingCents: 3000,
      }),
    ).toBeNull();
  });
});

describe("canPublishWithoutStripe", () => {
  it("allows publishing with offerings and availability", () => {
    expect(
      canPublishWithoutStripe({
        hasActiveOffering: true,
        hasAvailability: true,
      }),
    ).toEqual({ ok: true });
  });

  it("blocks publishing without offerings", () => {
    const result = canPublishWithoutStripe({
      hasActiveOffering: false,
      hasAvailability: true,
    });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/offering/i);
  });

  it("blocks publishing without availability", () => {
    const result = canPublishWithoutStripe({
      hasActiveOffering: true,
      hasAvailability: false,
    });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/availability/i);
  });

  it("blocks publishing without both", () => {
    const result = canPublishWithoutStripe({
      hasActiveOffering: false,
      hasAvailability: false,
    });
    expect(result).toHaveProperty("error");
  });
});
