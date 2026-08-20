"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveNeedsReview } from "./actions";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";

type Outcome = "pay_full" | "pay_reduced" | "refund";

const LABELS: Record<Outcome, string> = {
  pay_full: "Pay full",
  pay_reduced: "Pay reduced",
  refund: "Refund",
};

export function ReviewActions({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!outcome) return;
    if (!reason.trim()) {
      setError("A reason is required");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await resolveNeedsReview(bookingId, outcome, reason);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
    } else {
      setOutcome(null);
      setReason("");
      setLoading(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(LABELS) as Outcome[]).map((o) => (
        <Button
          key={o}
          size="small"
          variant={o === "refund" ? "destructive" : "secondary"}
          onClick={() => {
            setOutcome(o);
            setReason("");
            setError(null);
          }}
        >
          {LABELS[o]}
        </Button>
      ))}

      <Modal
        open={!!outcome}
        onClose={() => !loading && setOutcome(null)}
        title={outcome ? `${LABELS[outcome]} — confirm` : ""}
      >
        <p className="text-sm text-text-secondary">
          This resolves the flagged session and logs the action to the audit
          trail.
        </p>
        <Textarea
          className="mt-3"
          placeholder="Required reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
        <div className="mt-4 flex gap-2">
          <Button
            variant={outcome === "refund" ? "destructive" : "primary"}
            onClick={confirm}
            disabled={loading}
          >
            {loading ? "Processing…" : outcome ? `Confirm ${LABELS[outcome]}` : "Confirm"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setOutcome(null)}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
