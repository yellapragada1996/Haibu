import { describe, it, expect } from "vitest";
import {
  getStripeStatus,
  getStripeBannerState,
  canPublishWithoutStripe,
} from "./deferred-onboarding";

describe("getStripeStatus", () => {
  it("returns not_connected when no Stripe account", () => {
    expect(
      getStripeStatus({
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        identityVerified: false,
      }),
    ).toEqual({ kind: "not_connected" });
  });

  it("returns incomplete when account exists but onboarding not done", () => {
    expect(
      getStripeStatus({
        stripeAccountId: "acct_123",
        stripeOnboardingComplete: false,
        identityVerified: false,
      }),
    ).toEqual({ kind: "incomplete" });
  });

  it("returns verify when onboarding done but identity not verified", () => {
    expect(
      getStripeStatus({
        stripeAccountId: "acct_123",
        stripeOnboardingComplete: true,
        identityVerified: false,
      }),
    ).toEqual({ kind: "verify" });
  });

  it("returns connected when fully set up", () => {
    expect(
      getStripeStatus({
        stripeAccountId: "acct_123",
        stripeOnboardingComplete: true,
        identityVerified: true,
      }),
    ).toEqual({ kind: "connected" });
  });
});

describe("getStripeBannerState", () => {
  it("returns connect with 0 when creator has no Stripe and no earnings", () => {
    expect(
      getStripeBannerState({
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        identityVerified: false,
        pendingCents: 0,
      }),
    ).toEqual({ kind: "connect", pendingCents: 0 });
  });

  it("returns connect with amount when creator has no Stripe but has earnings", () => {
    expect(
      getStripeBannerState({
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        identityVerified: false,
        pendingCents: 2500,
      }),
    ).toEqual({ kind: "connect", pendingCents: 2500 });
  });

  it("returns verify when business/bank done but identity not verified", () => {
    expect(
      getStripeBannerState({
        stripeAccountId: "acct_123",
        stripeOnboardingComplete: true,
        identityVerified: false,
        pendingCents: 5000,
      }),
    ).toEqual({ kind: "verify" });
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

  it("returns connect with 0 when account exists but onboarding incomplete and no earnings", () => {
    expect(
      getStripeBannerState({
        stripeAccountId: "acct_123",
        stripeOnboardingComplete: false,
        identityVerified: false,
        pendingCents: 0,
      }),
    ).toEqual({ kind: "connect", pendingCents: 0 });
  });

  it("returns connect with amount when account exists but onboarding incomplete and has earnings", () => {
    expect(
      getStripeBannerState({
        stripeAccountId: "acct_123",
        stripeOnboardingComplete: false,
        identityVerified: false,
        pendingCents: 3000,
      }),
    ).toEqual({ kind: "connect", pendingCents: 3000 });
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
