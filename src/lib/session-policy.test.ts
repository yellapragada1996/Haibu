import { describe, it, expect } from "vitest";
import {
  COOLING_OFF_MS,
  HOLD_ESTABLISHED_MS,
  HOLD_NEW_CREATOR_MS,
  cancellationRefundPercent,
  computePresence,
  evaluateSessionOutcome,
  fanRefundPercent,
  graceMs,
  holdPeriodMs,
  needsCreatorReview,
  proportionalRefund,
} from "./session-policy";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("fanRefundPercent (§3 guest tiers, 2h threshold)", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("full refund more than 24h before start", () => {
    expect(fanRefundPercent(new Date(now.getTime() + 25 * HOUR), now)).toBe(1.0);
  });

  it("50% at exactly 24h before start", () => {
    expect(fanRefundPercent(new Date(now.getTime() + 24 * HOUR), now)).toBe(0.5);
  });

  it("50% between 2h and 24h before start", () => {
    expect(fanRefundPercent(new Date(now.getTime() + 3 * HOUR), now)).toBe(0.5);
  });

  it("50% at exactly 2h before start", () => {
    expect(fanRefundPercent(new Date(now.getTime() + 2 * HOUR), now)).toBe(0.5);
  });

  it("no refund less than 2h before start", () => {
    expect(fanRefundPercent(new Date(now.getTime() + 1 * HOUR), now)).toBe(0);
  });

  it("no refund after start", () => {
    expect(fanRefundPercent(new Date(now.getTime() - 1 * HOUR), now)).toBe(0);
  });
});

describe("cancellationRefundPercent (§3 cooling-off + §4 creator)", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("creator cancellation always refunds 100%", () => {
    const startAt = new Date(now.getTime() + 1 * HOUR);
    const createdAt = new Date(now.getTime() - 1 * DAY);
    expect(cancellationRefundPercent("creator", startAt, createdAt, now)).toBe(1.0);
  });

  it("guest cooling-off: full refund within 5 minutes of booking", () => {
    const startAt = new Date(now.getTime() + 2 * HOUR); // would be 50% by tier
    const createdAt = new Date(now.getTime() - 4 * 60 * 1000);
    expect(cancellationRefundPercent("fan", startAt, createdAt, now)).toBe(1.0);
  });

  it("guest cooling-off: exactly 5 minutes is NOT cooling-off", () => {
    const startAt = new Date(now.getTime() + 2 * HOUR); // 50% by tier
    const createdAt = new Date(now.getTime() - COOLING_OFF_MS);
    expect(cancellationRefundPercent("fan", startAt, createdAt, now)).toBe(0.5);
  });

  it("guest outside cooling-off, >24h → full", () => {
    const startAt = new Date(now.getTime() + 25 * HOUR);
    const createdAt = new Date(now.getTime() - 1 * DAY);
    expect(cancellationRefundPercent("fan", startAt, createdAt, now)).toBe(1.0);
  });

  it("guest outside cooling-off, <2h → none", () => {
    const startAt = new Date(now.getTime() + 1 * HOUR);
    const createdAt = new Date(now.getTime() - 1 * DAY);
    expect(cancellationRefundPercent("fan", startAt, createdAt, now)).toBe(0);
  });
});

describe("holdPeriodMs (§7)", () => {
  it("new creator (<5 completed) holds 7 days", () => {
    expect(holdPeriodMs(0)).toBe(HOLD_NEW_CREATOR_MS);
    expect(holdPeriodMs(4)).toBe(HOLD_NEW_CREATOR_MS);
    expect(HOLD_NEW_CREATOR_MS).toBe(7 * DAY);
  });

  it("established creator (>=5 completed) holds 96h", () => {
    expect(holdPeriodMs(5)).toBe(HOLD_ESTABLISHED_MS);
    expect(holdPeriodMs(10)).toBe(HOLD_ESTABLISHED_MS);
    expect(HOLD_ESTABLISHED_MS).toBe(96 * HOUR);
  });
});

describe("evaluateSessionOutcome (§5 binary no-show)", () => {
  it("both joined → completed, no refund", () => {
    expect(evaluateSessionOutcome(true, true)).toEqual({
      status: "completed",
      refund: false,
    });
  });

  it("guest only → no_show_fan, no refund (creator paid)", () => {
    expect(evaluateSessionOutcome(false, true)).toEqual({
      status: "no_show_fan",
      refund: false,
    });
  });

  it("creator only → no_show_creator, refund", () => {
    expect(evaluateSessionOutcome(true, false)).toEqual({
      status: "no_show_creator",
      refund: true,
      cancelled_by: "system",
      cancel_reason: "creator did not join",
    });
  });

  it("neither → cancelled_creator (mutual no-show), refund", () => {
    expect(evaluateSessionOutcome(false, false)).toEqual({
      status: "cancelled_creator",
      refund: true,
      cancelled_by: "system",
      cancel_reason: "mutual no-show",
    });
  });
});

describe("graceMs (§5 grace period = max(2min, 10%))", () => {
  it("15-min session → 2 minutes", () => {
    expect(graceMs(15 * 60 * 1000)).toBe(2 * 60 * 1000);
  });
  it("30-min session → 3 minutes (10%)", () => {
    expect(graceMs(30 * 60 * 1000)).toBe(3 * 60 * 1000);
  });
  it("60-min session → 6 minutes (10%)", () => {
    expect(graceMs(60 * 60 * 1000)).toBe(6 * 60 * 1000);
  });
});

describe("computePresence (§5 proportional stopwatch)", () => {
  const START = 0;
  const END = 30 * 60 * 1000; // 30-min session

  it("full presence → 0% undelivered", () => {
    const r = computePresence([{ joinedAtMs: 0, durationMs: END }], START, END);
    expect(r.undeliveredPercent).toBe(0);
    expect(r.totalPresentMs).toBe(END);
  });

  it("no sessions → 100% undelivered (0 present)", () => {
    const r = computePresence([], START, END);
    expect(r.undeliveredPercent).toBe(1);
    expect(r.totalPresentMs).toBe(0);
  });

  it("arrives 12 min late → 40% undelivered", () => {
    const r = computePresence(
      [{ joinedAtMs: 12 * 60 * 1000, durationMs: 18 * 60 * 1000 }],
      START,
      END,
    );
    expect(r.undeliveredPercent).toBeCloseTo(0.4, 5);
  });

  it("leaves at 15 min → 50% undelivered", () => {
    const r = computePresence(
      [{ joinedAtMs: 0, durationMs: 15 * 60 * 1000 }],
      START,
      END,
    );
    expect(r.undeliveredPercent).toBeCloseTo(0.5, 5);
  });

  it("reconnect within grace (gap 2min < 3min grace) → gap ignored", () => {
    // [0,10] then [12,30]: 2-min gap is under the 3-min grace → merged.
    const r = computePresence(
      [
        { joinedAtMs: 0, durationMs: 10 * 60 * 1000 },
        { joinedAtMs: 12 * 60 * 1000, durationMs: 18 * 60 * 1000 },
      ],
      START,
      END,
    );
    expect(r.undeliveredPercent).toBe(0);
  });

  it("reconnect beyond grace (gap 5min > 3min grace) → gap counted", () => {
    // [0,10] then [15,30]: 5-min gap exceeds grace → absent for those 5 min.
    const r = computePresence(
      [
        { joinedAtMs: 0, durationMs: 10 * 60 * 1000 },
        { joinedAtMs: 15 * 60 * 1000, durationMs: 15 * 60 * 1000 },
      ],
      START,
      END,
    );
    expect(r.undeliveredMs).toBe(5 * 60 * 1000);
    expect(r.undeliveredPercent).toBeCloseTo(5 / 30, 5);
  });

  it("presence outside the window is clipped", () => {
    // Starts 5 min early, ends 5 min late → clipped to the 30-min window.
    const r = computePresence(
      [{ joinedAtMs: -5 * 60 * 1000, durationMs: 40 * 60 * 1000 }],
      START,
      END,
    );
    expect(r.totalPresentMs).toBe(END);
    expect(r.undeliveredPercent).toBe(0);
  });
});

describe("needsCreatorReview (§5 partial-delivery flag)", () => {
  const DUR = 30 * 60 * 1000;

  it("creator never present → false (handled as no-show)", () => {
    expect(needsCreatorReview(computePresence([], 0, DUR), DUR)).toBe(false);
  });

  it("creator fully present → false", () => {
    const p = computePresence([{ joinedAtMs: 0, durationMs: DUR }], 0, DUR);
    expect(needsCreatorReview(p, DUR)).toBe(false);
  });

  it("creator present but missed > grace → true", () => {
    const p = computePresence(
      [{ joinedAtMs: 0, durationMs: 15 * 60 * 1000 }],
      0,
      DUR,
    );
    expect(needsCreatorReview(p, DUR)).toBe(true);
  });

  it("creator missed within grace → false", () => {
    // 2 min late on a 30-min session (grace 3 min) → no flag.
    const p = computePresence(
      [{ joinedAtMs: 2 * 60 * 1000, durationMs: 28 * 60 * 1000 }],
      0,
      DUR,
    );
    expect(needsCreatorReview(p, DUR)).toBe(false);
  });
});

describe("proportionalRefund (§5 money — balanced integer cents)", () => {
  const PRICE = 4000;
  const FEE = 720; // 18%

  it("40% undelivered, no stripe fee → 40% refund, 60% payout, balanced", () => {
    const r = proportionalRefund(PRICE, FEE, 0, 0.4);
    expect(r.refundCents).toBe(1600);
    expect(r.feeReversalCents).toBe(288);
    expect(r.effectivePayoutCents).toBe(1968);
    expect(r.refundCents + (FEE - r.feeReversalCents) + r.effectivePayoutCents).toBe(PRICE);
  });

  it("full refund (100%) → 0 payout", () => {
    const r = proportionalRefund(PRICE, FEE, 0, 1.0);
    expect(r.refundCents).toBe(PRICE);
    expect(r.effectivePayoutCents).toBe(0);
  });

  it("0% refund → full payout", () => {
    const r = proportionalRefund(PRICE, FEE, 0, 0);
    expect(r.refundCents).toBe(0);
    expect(r.effectivePayoutCents).toBe(PRICE - FEE);
  });

  it("with stripe fee — 0% refund → full payout minus stripe + platform", () => {
    const STRIPE = 146; // 2.9% of 4000 + 30
    const r = proportionalRefund(PRICE, FEE, STRIPE, 0);
    expect(r.refundCents).toBe(0);
    expect(r.effectivePayoutCents).toBe(PRICE - FEE - STRIPE);
  });

  it("with stripe fee — 50% refund → 50% of creator payout", () => {
    const STRIPE = 146;
    const r = proportionalRefund(PRICE, FEE, STRIPE, 0.5);
    expect(r.refundCents).toBe(2000);
    const creatorPayout = PRICE - FEE - STRIPE;
    expect(r.effectivePayoutCents).toBe(Math.round(creatorPayout * 0.5));
  });

  it("with stripe fee — 100% refund → 0 payout", () => {
    const STRIPE = 146;
    const r = proportionalRefund(PRICE, FEE, STRIPE, 1.0);
    expect(r.refundCents).toBe(PRICE);
    expect(r.effectivePayoutCents).toBe(0);
  });
});
