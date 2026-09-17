export type StripeStatus =
  | { kind: "not_connected" }
  | { kind: "incomplete" }
  | { kind: "verify" }
  | { kind: "connected" };

export function getStripeStatus(opts: {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  identityVerified: boolean;
}): StripeStatus {
  if (!opts.stripeAccountId) {
    return { kind: "not_connected" };
  }
  if (!opts.stripeOnboardingComplete) {
    return { kind: "incomplete" };
  }
  if (!opts.identityVerified) {
    return { kind: "verify" };
  }
  return { kind: "connected" };
}

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
  const status = getStripeStatus(opts);
  if (status.kind === "connected") return null;
  if (status.kind === "verify") return { kind: "verify" };
  // not_connected or incomplete — nudge from the dashboard
  if (opts.pendingCents > 0) {
    return { kind: "connect", pendingCents: opts.pendingCents };
  }
  // No earnings yet — still show a nudge so they know where to go
  return { kind: "connect", pendingCents: 0 };
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
