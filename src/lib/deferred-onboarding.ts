export type StripeBannerState =
  | { kind: "connect"; pendingCents: number }
  | { kind: "verify" }
  | null;

export function getStripeBannerState(opts: {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  identityVerified: boolean;
  pendingCents: number;
}): StripeBannerState {
  // Partial onboarding: has Stripe account, business/bank done, but identity not verified
  if (
    opts.stripeAccountId &&
    opts.stripeOnboardingComplete &&
    !opts.identityVerified
  ) {
    return { kind: "verify" };
  }

  // No Stripe account + has earnings waiting
  if (!opts.stripeAccountId && opts.pendingCents > 0) {
    return { kind: "connect", pendingCents: opts.pendingCents };
  }

  return null;
}

export function canPublishWithoutStripe(opts: {
  hasActiveOffering: boolean;
  hasAvailability: boolean;
}): { ok: true } | { error: string } {
  if (!opts.hasActiveOffering) {
    return { error: "Create at least one active offering before going live" };
  }
  if (!opts.hasAvailability) {
    return { error: "Set at least one availability window before going live" };
  }
  return { ok: true };
}
