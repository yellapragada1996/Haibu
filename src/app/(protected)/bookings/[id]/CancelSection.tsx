"use client";

import { useState } from "react";
import { cancelBooking } from "@/app/(protected)/actions/cancel";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { COOLING_OFF_MS } from "@/lib/session-policy";

// Policy (policies/haibu-session-policy.md §3): >24h full, 24h–2h 50%, <2h none,
// plus a 5-minute cooling-off grace right after booking.
function withinCoolingOff(createdAt: string | null): boolean {
  return (
    !!createdAt &&
    Date.now() - new Date(createdAt).getTime() < COOLING_OFF_MS
  );
}

function computeRefundText(
  startAt: string | null,
  createdAt: string | null,
): string | null {
  if (!startAt) return null;
  if (withinCoolingOff(createdAt)) return "Full refund";
  const hours = (new Date(startAt).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hours > 24) return "Full refund";
  if (hours >= 2) return "50% refund";
  return null; // no refund — within 2 hours
}

function computeRefundPercent(
  startAt: string | null,
  createdAt: string | null,
): number {
  if (!startAt) return 0;
  if (withinCoolingOff(createdAt)) return 100;
  const hours = (new Date(startAt).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hours > 24) return 100;
  if (hours >= 2) return 50;
  return 0;
}

export function CancelSection({
  bookingId,
  startAt,
  createdAt,
  priceCents,
  stripeFeeCents,
  role,
}: {
  bookingId: string;
  startAt: string;
  createdAt: string | null;
  priceCents: number;
  stripeFeeCents: number;
  role: "fan" | "creator";
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isCreator = role === "creator";
  const refundText = isCreator ? null : computeRefundText(startAt, createdAt);
  const percent = isCreator ? 100 : computeRefundPercent(startAt, createdAt);
  const netAmount = priceCents - stripeFeeCents;
  const refundCents = Math.round(netAmount * (percent / 100));

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
        {isCreator ? (
          "The guest will receive a refund (minus payment processing fees) and this session will be cancelled. You will not be paid for this session."
        ) : refundText ? (
          `${refundText}: you'll receive $${(refundCents / 100).toFixed(2)} back (after non-refundable processing fees)`
        ) : (
          "No refund at this stage"
        )}
      </p>
      <p className="mt-1 text-xs text-text-secondary">This cannot be undone.</p>
      <div className="mt-4 flex gap-2">
        <Button
          variant="destructive"
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
          variant="ghost"
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
