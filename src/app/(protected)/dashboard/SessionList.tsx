"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { submitReview } from "@/app/(protected)/actions/reviews";
import { REVIEW_PLACEHOLDER, REVIEW_WINDOW_MS } from "@/lib/review-tags";

export type SessionItem = {
  id: string;
  status: string;
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

const MAX_TEXT = 500;

function sessionBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "completed":
      return { label: "Completed", className: "border border-white text-white" };
    case "confirmed":
      return { label: "Upcoming", className: "border border-live-green text-live-green" };
    case "reserved":
      return { label: "Reserved", className: "border border-accent text-accent" };
    case "expired":
      return { label: "Expired", className: "border border-text-tertiary text-text-tertiary" };
    default:
      return { label: "Cancelled", className: "border border-text-tertiary text-text-tertiary" };
  }
}

function sessionTime(start: string, end: string): string {
  if (!start || !end) return "—";
  const date = new Date(start).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const s = new Date(start).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  const e = new Date(end).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${s} – ${e}`;
}

export function SessionList({
  upcoming,
  past,
}: {
  upcoming: SessionItem[];
  past: SessionItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [reviewing, setReviewing] = useState<SessionItem | null>(null);
  const [viewing, setViewing] = useState<SessionItem | null>(null);

  // Review form state
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openReview(s: SessionItem) {
    setReviewing(s);
    setRating(0);
    setHover(0);
    setText("");
    setError(null);
  }

  async function submit() {
    if (!reviewing) return;
    if (rating === 0) {
      setError("Select a rating");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await submitReview(reviewing.id, rating, text);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
    } else {
      setReviewing(null);
      setLoading(false);
      router.refresh();
    }
  }

  const list = tab === "upcoming" ? upcoming : past;
  const activeStars = hover || rating;
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
              <Link href="/" className="text-accent underline hover:text-accent-hover">
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
            const badge = sessionBadge(s.status);
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
                        <span className="truncate font-medium text-white">{s.creator_name}</span>
                        <span className={`rounded-pill px-2 py-0.5 text-xs ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {s.offering_title} · {sessionTime(s.start_at, s.end_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-text-secondary">
                      ${((s.price_cents ?? 0) / 100).toFixed(2)}
                    </span>
                  </Card>
                </Link>
              );
            }

            // Past session row
            return (
              <Card
                key={s.id}
                className={`flex items-center gap-4 ${
                  s.review || (completed && withinWindow)
                    ? "cursor-pointer hover:bg-bg-card-hover"
                    : ""
                }`}
                onClick={() => {
                  if (s.review) setViewing(s);
                  else if (completed && withinWindow) openReview(s);
                }}
              >
                <Link
                  href={`/creators/${s.creator_profile_id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Avatar src={s.creator_avatar} name={s.creator_name} size={44} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-white">{s.creator_name}</span>
                    <span className={`rounded-pill px-2 py-0.5 text-xs ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-text-secondary">
                    {s.offering_title} · {s.duration_minutes} min
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {sessionTime(s.start_at, s.end_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-sm text-text-secondary">
                    ${((s.price_cents ?? 0) / 100).toFixed(2)}
                  </span>
                  {completed && !s.review && withinWindow && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
                      <span aria-hidden>★</span> Rate
                    </span>
                  )}
                  {completed && !s.review && !withinWindow && (
                    <span className="text-xs text-text-tertiary">Review period expired</span>
                  )}
                  {completed && s.review && (
                    <span
                      className="text-xs text-amber-400"
                      aria-label={`${s.review.rating} stars`}
                    >
                      {"★".repeat(s.review.rating)}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review form modal */}
      <Modal
        open={!!reviewing}
        onClose={() => !loading && setReviewing(null)}
        title="Leave a review"
      >
        <div className="flex gap-1" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className={`text-2xl leading-none transition-transform ${
                n <= activeStars ? "text-amber-400" : "text-text-tertiary"
              } hover:scale-110`}
            >
              ★
            </button>
          ))}
        </div>

        <Textarea
          className="mt-4"
          placeholder={reviewing ? REVIEW_PLACEHOLDER : ""}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_TEXT}
        />

        {error && <p className="mt-2 text-sm text-error">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button onClick={submit} disabled={loading}>
            {loading ? "Submitting…" : "Submit review"}
          </Button>
          <Button variant="secondary" onClick={() => setReviewing(null)} disabled={loading}>
            Cancel
          </Button>
        </div>
      </Modal>

      {/* Read-only review modal */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Your review"
      >
        {viewing?.review && (
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-amber-400"
                aria-label={`${viewing.review.rating} stars`}
              >
                {"★".repeat(viewing.review.rating)}
              </span>
              <span className="text-sm text-text-secondary">
                {viewing.review.rating}/5
              </span>
            </div>

            {viewing.review.text ? (
              <p className="mt-3 text-sm text-text-secondary">{viewing.review.text}</p>
            ) : (
              <p className="mt-2 text-sm text-text-tertiary">
                No written review — rating only.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
