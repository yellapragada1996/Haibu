"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { blockUser } from "@/app/(protected)/actions/moderation";

export function BlockSection({
  bookingId,
  targetName,
  alreadyBlocked = false,
}: {
  bookingId: string;
  targetName: string;
  alreadyBlocked?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadyBlocked);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const result = await blockUser(bookingId);
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
      <p className="text-xs text-text-secondary">{targetName} is blocked.</p>
    );
  }

  return (
    <div>
      <Pill type="button" onClick={() => setOpen(true)}>
        Block {targetName}
      </Pill>
      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={`Block ${targetName}?`}
      >
        <p className="text-sm text-text-secondary">
          Neither of you will be able to book a session with the other.
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Blocking…" : "Block"}
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
