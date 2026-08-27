// ---------------------------------------------------------------------------
// Centralized session-policy math — the pure, deterministic rules from
// haibu-session-policy.md. No DB/I/O so these can be unit-tested directly.
// This is the single source of truth for money decisions; cancel.ts and the
// evaluation job import from here rather than re-implementing the numbers.
// ---------------------------------------------------------------------------

export const COOLING_OFF_MS = 5 * 60 * 1000;
export const HOLD_NEW_CREATOR_MS = 7 * 24 * 60 * 60 * 1000;
export const HOLD_ESTABLISHED_MS = 96 * 60 * 60 * 1000;
export const STRIPE_PERCENT = 0.029;
export const STRIPE_FIXED_CENTS = 30;
// Creators with fewer than this many prior successful sessions use the long hold.
export const HOLD_ESTABLISHED_THRESHOLD = 5;

// §3 — guest cancellation refund tiers (2-hour threshold), by time-to-start.
// >24h → full; 24h–2h → 50%; <2h → none.
export function fanRefundPercent(startAt: Date, now: Date = new Date()): number {
  const hours = (startAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hours > 24) return 1.0;
  if (hours >= 2) return 0.5;
  return 0;
}

// §3/§4 — refund percent for a cancellation. Creator cancellations always refund
// 100%. A guest cancelling within the 5-minute cooling-off window gets 100%
// regardless of time-to-session; otherwise the tiered guest rule applies.
export function cancellationRefundPercent(
  actor: "fan" | "creator",
  startAt: Date,
  createdAt: Date,
  now: Date = new Date(),
): number {
  if (actor === "creator") return 1.0;
  if (now.getTime() - createdAt.getTime() < COOLING_OFF_MS) return 1.0;
  return fanRefundPercent(startAt, now);
}

// §7 — payout hold period, by the creator's prior completed-session count.
export function holdPeriodMs(priorCompletedCount: number): number {
  return priorCompletedCount < HOLD_ESTABLISHED_THRESHOLD
    ? HOLD_NEW_CREATOR_MS
    : HOLD_ESTABLISHED_MS;
}

export function computeStripeFee(priceCents: number): number {
  return Math.round(priceCents * STRIPE_PERCENT) + STRIPE_FIXED_CENTS;
}

// §5 — no-show evaluation (binary, the current implementation). `status` is the
// booking status; `refund` is whether the guest is refunded in full. This is the
// seam the proportional model (later phase) will replace.
export type SessionOutcome = {
  status: "completed" | "no_show_fan" | "no_show_creator" | "cancelled_creator";
  refund: boolean;
  cancelled_by?: "system";
  cancel_reason?: string;
};

export function evaluateSessionOutcome(
  fanJoined: boolean,
  creatorJoined: boolean,
): SessionOutcome {
  if (fanJoined && creatorJoined) return { status: "completed", refund: false };
  if (!fanJoined && creatorJoined) return { status: "no_show_fan", refund: false };
  if (fanJoined && !creatorJoined) {
    return {
      status: "no_show_creator",
      refund: true,
      cancelled_by: "system",
      cancel_reason: "creator did not join",
    };
  }
  // Neither joined — mutual no-show (never counts toward reliability).
  return {
    status: "cancelled_creator",
    refund: true,
    cancelled_by: "system",
    cancel_reason: "mutual no-show",
  };
}

// ---------------------------------------------------------------------------
// §5 presence — the proportional stopwatch (Phase 4). Duration-based, so it
// scales with session length. Daily gives us per-session `joined_at` + `duration`.
// ---------------------------------------------------------------------------

export interface PresenceSession {
  joinedAtMs: number;
  durationMs: number;
}

export interface PresenceSummary {
  totalPresentMs: number;
  undeliveredMs: number;
  undeliveredPercent: number; // 0..1
}

// Grace period: the greater of 2 minutes or 10% of the scheduled duration.
export function graceMs(scheduledDurationMs: number): number {
  return Math.max(2 * 60 * 1000, Math.round(scheduledDurationMs * 0.1));
}

// Compute a participant's presence within the scheduled window. Sessions whose
// gap is under the grace period are merged (a brief disconnect "counts as
// present"). Returns undelivered time as a fraction of the scheduled duration.
export function computePresence(
  sessions: PresenceSession[],
  scheduledStartMs: number,
  scheduledEndMs: number,
): PresenceSummary {
  const scheduledDurationMs = scheduledEndMs - scheduledStartMs;
  const g = graceMs(scheduledDurationMs);
  const sorted = [...sessions].sort((a, b) => a.joinedAtMs - b.joinedAtMs);

  // Merge intervals whose gap is within grace (unclipped, so gaps are true).
  const merged: { start: number; end: number }[] = [];
  for (const s of sorted) {
    const sEnd = s.joinedAtMs + s.durationMs;
    const last = merged[merged.length - 1];
    if (last && s.joinedAtMs - last.end < g) {
      last.end = Math.max(last.end, sEnd);
    } else {
      merged.push({ start: s.joinedAtMs, end: sEnd });
    }
  }

  // Clip merged intervals to the scheduled window and sum.
  let totalPresentMs = 0;
  for (const m of merged) {
    const cs = Math.max(m.start, scheduledStartMs);
    const ce = Math.min(m.end, scheduledEndMs);
    if (ce > cs) totalPresentMs += ce - cs;
  }

  const undeliveredMs = Math.max(0, scheduledDurationMs - totalPresentMs);
  const undeliveredPercent =
    scheduledDurationMs > 0 ? undeliveredMs / scheduledDurationMs : 0;
  return { totalPresentMs, undeliveredMs, undeliveredPercent };
}

// A booking needs admin review when the creator was present (>0) but missed
// more than the grace window — i.e. partial delivery that the binary model
// would otherwise mark "completed" and pay in full.
export function needsCreatorReview(
  presence: PresenceSummary,
  scheduledDurationMs: number,
): boolean {
  return (
    presence.totalPresentMs > 0 &&
    presence.undeliveredMs > graceMs(scheduledDurationMs)
  );
}

// ---------------------------------------------------------------------------
// §5 proportional refund (Phase 5) — the money movement for a creator who
// partially delivered. Keeps integer cents balanced:
//   refund + fee_retained + payout = price.
// ---------------------------------------------------------------------------

export interface ProportionalRefund {
  refundCents: number;
  feeReversalCents: number;
  effectivePayoutCents: number;
}

export function proportionalRefund(
  priceCents: number,
  platformFeeCents: number,
  stripeFeeCents: number,
  refundPercent: number, // 0..1
): ProportionalRefund {
  const netAmount = priceCents - stripeFeeCents;
  const refundCents = Math.round(netAmount * refundPercent);
  const creatorPayoutCents = priceCents - stripeFeeCents - platformFeeCents;
  const effectivePayoutCents = Math.round(creatorPayoutCents * (1 - refundPercent));
  const feeReversalCents = netAmount - refundCents - effectivePayoutCents;
  return { refundCents, feeReversalCents, effectivePayoutCents };
}
