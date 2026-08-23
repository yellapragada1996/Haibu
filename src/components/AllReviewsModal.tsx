"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Avatar } from "@/components/ui/Avatar";

type Review = {
  id: string;
  rating: number | null;
  text: string | null;
  guestName: string | null;
  createdAt: string;
};

type Distribution = Record<number, number>;

type Props = {
  creatorId: string;
  reviewCount: number;
  avgRating: number;
  trigger: React.ReactNode;
};

export function AllReviewsModal({ creatorId, reviewCount, avgRating, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const isMobile = useMediaQuery("(max-width: 639px)");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchReviews = useCallback(
    async (cursor?: string | null) => {
      setLoading(true);
      const url = `/api/creator/${creatorId}/reviews${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setReviews((prev) => (cursor ? [...prev, ...data.reviews] : data.reviews));
      setNextCursor(data.nextCursor);
      if (data.distribution) setDistribution(data.distribution);
      setLoading(false);
      setInitialLoaded(true);
    },
    [creatorId],
  );

  useEffect(() => {
    if (open && !initialLoaded) fetchReviews();
  }, [open, initialLoaded, fetchReviews]);

  useEffect(() => {
    if (!open || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loading) {
          fetchReviews(nextCursor);
        }
      },
      { root: scrollRef.current, threshold: 0 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [open, nextCursor, loading, fetchReviews]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function handleReset() {
    setOpen(false);
    setReviews([]);
    setNextCursor(null);
    setDistribution(null);
    setInitialLoaded(false);
  }

  const maxCount = distribution ? Math.max(...Object.values(distribution), 1) : 1;

  function relativeDate(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="contents">
        {trigger}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={handleReset} />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={`All ${reviewCount} reviews`}
            className={`relative flex flex-col bg-bg-surface ${
              isMobile === false
                ? "mx-4 max-h-[80vh] w-full max-w-md rounded-modal"
                : "max-h-[92vh] w-full rounded-t-2xl"
            }`}
          >
            {/* Drag handle (mobile) */}
            {isMobile !== false && (
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-neutral-default/40" />
              </div>
            )}

            {/* Header */}
            <div className="shrink-0 border-b border-border-subtle px-5 pb-4 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
                </h2>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-neutral-default/20"
                  aria-label="Close"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="4" x2="12" y2="12" />
                    <line x1="12" y1="4" x2="4" y2="12" />
                  </svg>
                </button>
              </div>

              {/* Rating summary + distribution */}
              <div className="mt-3 flex gap-5">
                <div className="flex flex-col items-center">
                  <span className="text-4xl font-bold text-white">{avgRating.toFixed(1)}</span>
                  <span className="text-sm text-rating">
                    {"★".repeat(Math.round(avgRating))}
                  </span>
                </div>
                {distribution && (
                  <div className="flex flex-1 flex-col justify-center gap-1">
                    {[5, 4, 3, 2, 1].map((star) => (
                      <div key={star} className="flex items-center gap-2">
                        <span className="w-3 text-right text-xs text-text-secondary">{star}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-default/20">
                          <div
                            className="h-full rounded-full bg-rating"
                            style={{ width: `${(distribution[star] / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Scrollable review list */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-3">
              {reviews.map((r) => {
                const firstName = (r.guestName ?? "").split(" ")[0] || "Guest";
                return (
                  <div key={r.id} className="border-b border-border-subtle py-3 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <Avatar name={firstName} size={28} />
                      <span className="text-sm font-medium text-white">{firstName}</span>
                      <span className="text-xs text-text-tertiary">{relativeDate(r.createdAt)}</span>
                    </div>
                    <div className="mt-1 text-sm text-rating" aria-label={`${r.rating ?? 0} stars`}>
                      {"★".repeat(r.rating ?? 0)}
                    </div>
                    {r.text && (
                      <p className="mt-1 text-sm leading-relaxed text-text-secondary">{r.text}</p>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
                </div>
              )}

              <div ref={sentinelRef} className="h-1" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
