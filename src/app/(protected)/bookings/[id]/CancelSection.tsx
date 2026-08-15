"use client";

import { useState } from "react";
import { cancelBooking } from "@/app/(protected)/actions/cancel";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

function computeRefundText(startAt: string | null): string | null {
  if (!startAt) return null;
  const hours = (new Date(startAt).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hours > 24) return "Full refund";
  if (hours >= 1) return "50% refund";
  return null; // no refund — within 1 hour
}

export function CancelSection({
  bookingId,
  startAt,
  priceCents,
  role,
}: {
  bookingId: string;
  startAt: string;
  priceCents: number;
  role: "fan" | "creator";
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const refundText = role === "creator" ? "Full refund" : computeRefundText(startAt);
  const percent =
    role === "creator"
      ? 100
      : (() => {
          const h = (new Date(startAt).getTime() - Date.now()) / 3600000;
          if (h > 24) return 100;
          if (h >= 1) return 50;
          return 0;
        })();

  const refundCents = Math.round(priceCents * (percent / 100));

  if (!showConfirm) {
    return (
      <Button
        variant="secondary"
        className="mt-4 w-full"
        onClick={() => setShowConfirm(true)}
      >
        Cancel session
      </Button>
    );
  }

  return (
    <Modal
      open
      onClose={() => !loading && setShowConfirm(false)}
      title="Cancel session"
    >
      <p className="text-sm text-white">
        {refundText
          ? `${refundText}: you'll receive $${(refundCents / 100).toFixed(2)} back`
          : "No refund at this stage"}
      </p>
      <p className="mt-1 text-xs text-text-secondary">This cannot be undone.</p>
      <div className="mt-4 flex gap-2">
        <Button
          onClick={async () => {
            setLoading(true);
            setError(null);
            const result = await cancelBooking(bookingId, role);
            if ("error" in result) {
              setError(result.error);
              setLoading(false);
            } else {
              router.refresh();
            }
          }}
          disabled={loading}
        >
          {loading ? "Cancelling…" : "Confirm cancellation"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowConfirm(false)}
          disabled={loading}
        >
          Keep session
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </Modal>
  );
}
