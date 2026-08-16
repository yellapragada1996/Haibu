"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { submitReview } from "@/app/(protected)/actions/reviews";
import { REVIEW_PLACEHOLDER } from "@/lib/review-tags";

const MAX_TEXT = 500;

export function ReviewSection({
  bookingId,
  creatorName,
  category,
}: {
  bookingId: string;
  creatorName: string;
  category: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const active = hover || rating;
  const remaining = MAX_TEXT - text.length;

  async function handleSubmit() {
    if (rating === 0) {
      setError("Select a rating");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await submitReview(bookingId, rating, text);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
    } else {
      setDone(true);
      router.refresh();
    }
  }

  if (done) {
    return (
      <Card className="mt-6">
        <p className="text-sm font-medium text-live-green">Reviewed ✓</p>
        <p className="mt-1 text-xs text-text-secondary">
          Thank you — your review has been shared with {creatorName}.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <p className="text-sm font-semibold text-white">Leave a review</p>
      <p className="mt-1 text-xs text-text-secondary">
        Share how your session went.
      </p>

      <div className="mt-3 flex gap-1" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className={`text-2xl leading-none transition-transform ${
              n <= active ? "text-amber-400" : "text-text-tertiary"
            } hover:scale-110`}
          >
            ★
          </button>
        ))}
      </div>

      <Textarea
        className="mt-4"
        placeholder={REVIEW_PLACEHOLDER}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_TEXT}
      />
      {remaining <= 100 && (
        <p className="mt-1 text-xs text-text-tertiary">
          {remaining} characters remaining
        </p>
      )}

      <Button className="mt-4" onClick={handleSubmit} disabled={loading}>
        {loading ? "Submitting…" : "Submit review"}
      </Button>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </Card>
  );
}
