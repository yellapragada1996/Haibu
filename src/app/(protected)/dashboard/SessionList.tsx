"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { REVIEW_WINDOW_MS } from "@/lib/review-tags";
import { bookingLabel } from "@/lib/status";

export type SessionItem = {
  id: string;
  status: string;
  cancelled_by: string | null;
  needs_review: boolean;
  effective_payout_cents: number | null;
  start_at: string;
  end_at: string;
  price_cents: number;
  creator_profile_id: string;
  creator_name: string;
  creator_avatar: string | null;
  offering_title: string;
  duration_minutes: number;
  category: string;
  review: { rating: number; text: string | null; tags: string[] } | null;
};

function sessionBadgeClassName(status: string): string {
  switch (status) {
    case "completed":
      return "border border-white text-text-primary";
    case "confirmed":
      return "border border-live text-live";
    case "reserved":
      return "border border-text-secondary text-text-secondary";
    default:
      return "border border-text-tertiary text-text-tertiary";
  }
}

function sessionTime(start: string, end: string, timezone?: string | null): string {
  if (!start || !end) return "—";
  const dateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  if (timezone) {
    dateOpts.timeZone = timezone;
    timeOpts.timeZone = timezone;
  }
  const date = new Date(start).toLocaleDateString("en-US", dateOpts);
  const s = new Date(start).toLocaleTimeString("en-US", timeOpts);
  const e = new Date(end).toLocaleTimeString("en-US", timeOpts);
  return `${date} · ${s} – ${e}`;
}

export function SessionList({
  upcoming,
  past,
  timezone,
}: {
  upcoming: SessionItem[];
  past: SessionItem[];
  timezone?: string | null;
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const list = tab === "upcoming" ? upcoming : past;
  const pendingCount = past.filter(
    (s) =>
      s.status === "completed" &&
      !s.review &&
      Date.now() <= new Date(s.end_at).getTime() + REVIEW_WINDOW_MS,
  ).length;

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Pill variant={tab === "upcoming" ? "active" : "inactive"} onClick={() => setTab("upcoming")}>
          Upcoming
        </Pill>
        <Pill variant={tab === "past" ? "active" : "inactive"} onClick={() => setTab("past")}>
          Past
        </Pill>
      </div>

      {tab === "past" && pendingCount > 0 && (
        <p className="mb-3 text-xs text-text-tertiary">
          {pendingCount} session{pendingCount === 1 ? "" : "s"} awaiting review
        </p>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {tab === "upcoming" ? (
            <>
              No upcoming sessions —{" "}
              <Link href="/" className="text-primary underline hover:text-primary-hover">
                browse creators
              </Link>
            </>
          ) : (
            "No past sessions yet."
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((s) => {
            const isPastEnd = s.end_at ? new Date(s.end_at) < new Date() : false;
            const badgeLabel = bookingLabel(
              s.status,
              { cancelled_by: s.cancelled_by, needs_review: s.needs_review, effective_payout_cents: s.effective_payout_cents, isPastEnd },
              "guest",
            );
            const badgeClass = sessionBadgeClassName(s.status);
            const completed = s.status === "completed";
            const withinWindow =
              Date.now() <= new Date(s.end_at).getTime() + REVIEW_WINDOW_MS;

            if (tab === "upcoming") {
              return (
                <Link key={s.id} href={`/bookings/${s.id}`}>
                  <Card hover className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-secondary">With</span>
                        <span className="truncate font-medium text-text-primary">{s.creator_name}</span>
                        <span className={`rounded-pill px-2 py-0.5 text-xs ${badgeClass}`}>
                          {badgeLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {s.offering_title} · {sessionTime(s.start_at, s.end_at, timezone)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-text-secondary">
                      ${((s.price_cents ?? 0) / 100).toFixed(2)}
                    </span>
                  </Card>
                </Link>
              );
            }

            // Past session row — links to the session detail page.
            return (
              <Link key={s.id} href={`/bookings/${s.id}`}>
                <Card hover className="flex items-center gap-4">
                  <Avatar src={s.creator_avatar} name={s.creator_name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-text-primary">{s.creator_name}</span>
                      <span className={`rounded-pill px-2 py-0.5 text-xs ${badgeClass}`}>
                        {badgeLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-text-secondary">
                      {s.offering_title} · {s.duration_minutes} min
                    </p>
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      {sessionTime(s.start_at, s.end_at, timezone)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-sm text-text-secondary">
                      ${((s.price_cents ?? 0) / 100).toFixed(2)}
                    </span>
                    {completed && !s.review && withinWindow && (
                      <span className="flex items-center gap-1 text-xs font-medium text-rating">
                        <span aria-hidden>★</span> Rate
                      </span>
                    )}
                    {completed && !s.review && !withinWindow && (
                      <span className="text-xs text-text-tertiary">Review period expired</span>
                    )}
                    {completed && s.review && (
                      <span
                        className="text-xs text-rating"
                        aria-label={`${s.review.rating} stars`}
                      >
                        {"★".repeat(s.review.rating)}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
