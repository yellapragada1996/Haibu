"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { reportBooking } from "@/app/(protected)/actions/moderation";

export function ReportSection({
  bookingId,
  targetName,
}: {
  bookingId: string;
  targetName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) {
      setError("Please describe the issue");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await reportBooking(bookingId, reason);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
    } else {
      setDone(true);
      setOpen(false);
      router.refresh();
    }
  }

  if (done) {
    return (
      <p className="text-xs text-text-secondary">
        Report submitted — thank you.
      </p>
    );
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="small"
        onClick={() => setOpen(true)}
      >
        Report
      </Button>
      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Report a problem"
      >
        <p className="text-sm text-text-secondary">
          Tell us what happened with {targetName}. Reports are reviewed by our
          team.
        </p>
        <Textarea
          className="mt-3"
          placeholder="Describe the issue"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-4 flex gap-2">
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Submitting…" : "Submit report"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
      </Modal>
    </div>
  );
}
