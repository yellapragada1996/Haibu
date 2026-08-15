"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { submitCreatorReview } from "@/app/(protected)/actions/reviews";

function ThumbUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
    </svg>
  );
}

function ThumbDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

function thumbClass(selected: boolean, kind: "positive" | "negative") {
  const base =
    "flex items-center gap-2 rounded-pill border px-4 py-2 text-sm font-semibold transition-colors";
  if (selected && kind === "positive") {
    return `${base} border-live-green text-live-green bg-bg-card-hover`;
  }
  if (selected && kind === "negative") {
    return `${base} border-error text-error bg-bg-card-hover`;
  }
  return `${base} border-border-subtle text-text-secondary hover:text-white`;
}

export function CreatorReviewButton({
  bookingId,
  fanName,
  reviewed,
  canReview,
}: {
  bookingId: string;
  fanName: string;
  reviewed: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sentiment, setSentiment] = useState<"positive" | "negative" | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!sentiment) {
      setError("Select thumbs up or thumbs down");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await submitCreatorReview(bookingId, sentiment, note);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  if (reviewed) {
    return <span className="text-xs font-medium text-live-green">Reviewed ✓</span>;
  }
  if (!canReview) {
    return <span className="text-xs text-text-tertiary">Review period expired</span>;
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setSentiment(null);
          setNote("");
          setError(null);
        }}
        className="rounded-pill border border-border-subtle px-3 py-1 text-xs font-semibold text-white hover:bg-bg-card-hover"
      >
        Review this guest
      </button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={`Review ${fanName}`}
      >
        <p className="text-sm text-text-secondary">
          Would you accept a booking from this guest again?
        </p>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => setSentiment("positive")}
            className={thumbClass(sentiment === "positive", "positive")}
          >
            <ThumbUp /> Thumbs up
          </button>
          <button
            type="button"
            onClick={() => setSentiment("negative")}
            className={thumbClass(sentiment === "negative", "negative")}
          >
            <ThumbDown /> Thumbs down
          </button>
        </div>

        {sentiment === "negative" && (
          <Textarea
            className="mt-4"
            placeholder="What happened? (Only Haibu sees this.)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        )}

        {error && <p className="mt-2 text-sm text-error">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button onClick={submit} disabled={loading || !sentiment}>
            {loading ? "Submitting…" : "Submit review"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}
