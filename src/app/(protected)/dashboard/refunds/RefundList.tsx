"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";

export interface RefundItem {
  id: string;
  bookingId: string;
  refundCents: number;
  priceCents: number;
  refundedAt: string;
  startAt: string;
  offeringTitle: string;
  creatorName: string;
  creatorAvatar: string | null;
  status: string;
  cancelledBy: string | null;
  cancelReason: string | null;
  note: string | null;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function refundReasonShort(item: RefundItem): string {
  if (item.status === "cancelled_fan") return "You cancelled";
  if (item.status === "cancelled_creator") {
    if (item.cancelledBy === "system" && item.cancelReason === "mutual no-show")
      return "Session didn't happen";
    return "Creator cancelled";
  }
  if (item.status === "cancelled_admin") return "Cancelled by Haibu";
  if (item.status === "no_show_creator") {
    if (item.note?.startsWith("proportional refund"))
      return "Session partially delivered";
    return "Creator didn't join";
  }
  if (item.note?.startsWith("proportional refund"))
    return "Session partially delivered";
  return "Refunded";
}

function refundReasonDetail(item: RefundItem): string {
  if (item.status === "cancelled_fan")
    return "You cancelled this session. The refund amount is based on how far in advance the cancellation was made.";
  if (item.status === "cancelled_creator") {
    if (item.cancelledBy === "system" && item.cancelReason === "mutual no-show")
      return "Neither party joined the session, so it was automatically cancelled and fully refunded.";
    return "The creator cancelled this session. You received a full refund.";
  }
  if (item.status === "cancelled_admin")
    return "This session was cancelled by Haibu support. You received a refund.";
  if (item.status === "no_show_creator") {
    if (item.note?.startsWith("proportional refund")) {
      const match = item.note.match(/delivered (\d+)%/);
      const pct = match ? match[1] : "part";
      return `The creator was present for ${pct}% of the session. You were refunded for the undelivered portion.`;
    }
    return "The creator did not join the session. You received a full refund.";
  }
  if (item.note?.startsWith("proportional refund")) {
    const match = item.note.match(/delivered (\d+)%/);
    const pct = match ? match[1] : "part";
    return `The creator was present for ${pct}% of the session. You were refunded for the undelivered portion.`;
  }
  return "A refund was issued for this session.";
}

function formatDate(iso: string, tz: string | null): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: tz ?? undefined,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
}

function formatDateTime(iso: string, tz: string | null): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: tz ?? undefined,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <span
        className={`text-sm ${highlight ? "font-semibold text-white" : "text-text-secondary"}`}
      >
        {value}
      </span>
    </div>
  );
}

export function RefundList({
  items,
  timezone,
}: {
  items: RefundItem[];
  timezone: string | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-border-subtle bg-bg-card px-6 py-12 text-center">
        <p className="text-text-secondary">No refunds yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isPartial = item.refundCents < item.priceCents;
        const percent = Math.round((item.refundCents / item.priceCents) * 100);
        const reason = refundReasonShort(item);
        const isExpanded = expandedId === item.id;

        return (
          <div
            key={item.id}
            className="rounded-card border border-border-subtle bg-bg-card transition-colors hover:bg-bg-card-hover"
          >
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              className="w-full p-4 text-left"
              aria-expanded={isExpanded}
            >
              <div className="flex items-start gap-3">
                <Avatar
                  src={item.creatorAvatar}
                  name={item.creatorName}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {item.offeringTitle}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        with {item.creatorName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">
                          {money(item.refundCents)}
                        </p>
                        {isPartial && (
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {percent}% refund
                          </p>
                        )}
                      </div>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 text-text-tertiary transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="cancelled" label={reason} />
                    <span className="text-xs text-text-tertiary">
                      {formatDate(item.startAt, timezone)}
                    </span>
                  </div>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border-subtle px-4 pb-4 pt-3">
                <p className="mb-3 text-sm text-text-secondary leading-relaxed">
                  {refundReasonDetail(item)}
                </p>

                <div className="rounded-input bg-bg-base border border-border-subtle px-4 py-2 divide-y divide-border-subtle">
                  <DetailRow
                    label="Session price"
                    value={money(item.priceCents)}
                  />
                  <DetailRow
                    label="Refund amount"
                    value={
                      isPartial
                        ? `${money(item.refundCents)} (${percent}%)`
                        : `${money(item.refundCents)} (full)`
                    }
                    highlight
                  />
                  {item.startAt && (
                    <DetailRow
                      label="Session date"
                      value={formatDateTime(item.startAt, timezone)}
                    />
                  )}
                  <DetailRow
                    label="Refunded on"
                    value={formatDateTime(item.refundedAt, timezone)}
                  />
                </div>

                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/bookings/${item.bookingId}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    View booking details
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
