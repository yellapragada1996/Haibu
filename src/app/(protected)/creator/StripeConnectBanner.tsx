import Link from "next/link";
import type { StripeBannerState } from "@/lib/deferred-onboarding";
import { formatCents } from "@/lib/format";

export function StripeConnectBanner({ state }: { state: StripeBannerState }) {
  if (!state) return null;

  const message =
    state.kind === "verify"
      ? "Finish identity verification to start receiving payouts."
      : state.pendingCents > 0
        ? `You have ${formatCents(state.pendingCents)} waiting — connect your bank account.`
        : "Connect your bank account so you can receive payouts.";

  return (
    <Link
      href="/creator/earnings"
      className="mt-5 flex items-center justify-between rounded-card border border-live/20 bg-live/5 px-4 py-3 transition-colors hover:bg-live/10"
    >
      <p className="text-sm text-text-primary">{message}</p>
      <span className="shrink-0 text-xs font-semibold text-live">
        Set up →
      </span>
    </Link>
  );
}
