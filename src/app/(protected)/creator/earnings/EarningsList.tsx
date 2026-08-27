"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import type { EarningsSession } from "@/lib/creator-studio";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

function fmtDate(d: string, tz: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
  });
}

function fmtTime(d: string, tz: string): string {
  return new Date(d).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

function outcomeLabel(status: string, cancelledBy: string | null): string {
  switch (status) {
    case "completed":
      return "Session completed";
    case "no_show_fan":
      return "Guest didn't join";
    case "no_show_creator":
      return "You didn't join";
    case "cancelled_fan":
      return "Guest cancelled";
    case "cancelled_creator":
      return cancelledBy === "system"
        ? "Neither party joined"
        : "You cancelled";
    default:
      return status;
  }
}

type Props = {
  sessions: (EarningsSession & {
    startAtIso: string | null;
    endAtIso: string | null;
    paysAtIso: string | null;
  })[];
  platformFeeRate: number;
  timezone: string;
};

export function EarningsList({ sessions, platformFeeRate, timezone }: Props) {
  const [selected, setSelected] = useState<(typeof sessions)[number] | null>(
    null,
  );

  const feePercent = Math.round(platformFeeRate * 100);

  return (
    <>
      <div className="space-y-2">
        {sessions.map((s) => {
          const badge =
            s.status === "paid" ? (
              <Badge variant="confirmed" label="Paid" />
            ) : s.status === "on_hold" ? (
              <Badge variant="error" label="On hold" />
            ) : (
              <Badge variant="pending" label="Pending" />
            );

          return (
            <button
              key={s.id}
              type="button"
              className="w-full text-left"
              onClick={() => setSelected(s)}
            >
              <Card hover className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {s.offering}
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {s.startAtIso ? fmtDate(s.startAtIso, timezone) : ""}
                    {s.startAtIso && s.endAtIso
                      ? ` · ${fmtTime(s.startAtIso, timezone)} – ${fmtTime(s.endAtIso, timezone)}`
                      : ""}
                    {" · "}
                    {s.guest}
                    {" · "}
                    {s.duration} min
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-bold text-white">
                    {formatCents(s.amount)}
                  </span>
                  {badge}
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Session details"
      >
        {selected && (
          <div className="space-y-5">
            {/* Session info */}
            <div className="space-y-1.5">
              <Row label="Session" value={selected.offering} />
              <Row label="Guest" value={selected.guest} />
              <Row label="Duration" value={`${selected.duration} min`} />
              {selected.startAtIso && (
                <Row
                  label="Time"
                  value={`${fmtDate(selected.startAtIso, timezone)} · ${fmtTime(selected.startAtIso, timezone)}${selected.endAtIso ? ` – ${fmtTime(selected.endAtIso, timezone)}` : ""}`}
                />
              )}
              <Row
                label="Outcome"
                value={outcomeLabel(
                  selected.bookingStatus,
                  selected.cancelledBy,
                )}
              />
            </div>

            {/* Attendance */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Attendance
              </p>
              <div className="space-y-1.5">
                <Row
                  label="You joined"
                  value={selected.creatorJoined ? "Yes" : "No"}
                  valueClass={
                    selected.creatorJoined ? "text-live" : "text-error"
                  }
                />
                <Row
                  label="Guest joined"
                  value={selected.fanJoined ? "Yes" : "No"}
                  valueClass={
                    selected.fanJoined ? "text-live" : "text-error"
                  }
                />
              </div>
              {!selected.creatorJoined &&
                selected.bookingStatus !== "cancelled_fan" && (
                  <p className="mt-2 text-xs text-text-tertiary">
                    If you don't attend the full session, your payout may be
                    reduced proportionally per our policy.
                  </p>
                )}
            </div>

            {/* Money breakdown */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Earnings breakdown
              </p>
              <div className="space-y-1.5">
                <Row
                  label="Guest paid"
                  value={formatCents(selected.priceCents)}
                />
                <Row
                  label="Stripe processing (2.9% + 30¢)"
                  value={`-${formatCents(selected.stripeFeeCents)}`}
                  valueClass="text-text-secondary"
                />
                <Row
                  label={`Platform fee (${feePercent}%)`}
                  value={`-${formatCents(selected.platformFeeCents)}`}
                  valueClass="text-text-secondary"
                />
                {selected.effectivePayoutCents != null &&
                  selected.effectivePayoutCents !==
                    selected.creatorPayoutCents && (
                    <>
                      <Row
                        label="Full payout"
                        value={formatCents(selected.creatorPayoutCents)}
                        valueClass="text-text-secondary line-through"
                      />
                      <Row
                        label="Adjusted payout"
                        value={formatCents(selected.effectivePayoutCents)}
                        bold
                      />
                      <p className="mt-1 text-xs text-text-tertiary">
                        Payout was adjusted because the session was partially
                        delivered. The guest received a proportional refund.
                      </p>
                    </>
                  )}
                {(selected.effectivePayoutCents == null ||
                  selected.effectivePayoutCents ===
                    selected.creatorPayoutCents) && (
                  <Row
                    label="Your payout"
                    value={formatCents(selected.creatorPayoutCents)}
                    bold
                  />
                )}
              </div>
            </div>

            {/* Payout status */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider">
                Payout
              </p>
              <div className="space-y-1.5">
                <Row
                  label="Status"
                  value={
                    selected.status === "paid"
                      ? "Paid out"
                      : selected.status === "on_hold"
                        ? "Under review"
                        : "Pending"
                  }
                  valueClass={
                    selected.status === "paid"
                      ? "text-live"
                      : selected.status === "on_hold"
                        ? "text-error"
                        : "text-yellow-400"
                  }
                />
                {selected.status === "pending" && selected.paysAtIso && (
                  <Row
                    label="Eligible after"
                    value={new Date(selected.paysAtIso).toLocaleDateString(
                      "en-US",
                      {
                        timeZone: timezone,
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                  />
                )}
                {selected.status === "pending" && (
                  <p className="mt-1 text-xs text-text-tertiary">
                    Payouts are processed daily. New creators have a 7-day hold;
                    after 5 completed sessions the hold drops to 4 days.
                  </p>
                )}
                {selected.status === "on_hold" && (
                  <p className="mt-1 text-xs text-text-tertiary">
                    This session is under admin review. Payout is paused until
                    the review is complete.
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-2 w-full rounded-input bg-bg-card-hover py-2.5 text-sm font-medium text-white hover:bg-border-subtle"
            >
              Close
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}

function Row({
  label,
  value,
  valueClass,
  bold,
}: {
  label: string;
  value: string;
  valueClass?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-text-secondary">{label}</span>
      <span
        className={`text-right text-sm ${bold ? "font-bold" : "font-medium"} ${valueClass ?? "text-white"}`}
      >
        {value}
      </span>
    </div>
  );
}
