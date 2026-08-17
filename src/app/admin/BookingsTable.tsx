"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminForceCancel, noShowOverride } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { formatDateTime } from "@/lib/format";

type BookingRow = {
  id: string;
  status: string;
  start_at: string;
  price_cents: number;
  fan: string;
  creator: string;
  offering: string;
};

function shortId(id: string) {
  return id.slice(0, 8);
}

function statusClass(s: string) {
  switch (s) {
    case "confirmed":
      return "border border-live text-live";
    case "reserved":
      return "border border-text-secondary text-text-secondary";
    case "completed":
      return "border border-white text-white";
    default:
      return "border border-text-tertiary text-text-tertiary";
  }
}

export function BookingsTable({ rows }: { rows: BookingRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<BookingRow | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overrideTarget, setOverrideTarget] = useState<BookingRow | null>(null);
  const [overrideChoice, setOverrideChoice] = useState<"completed" | "refund">(
    "completed",
  );
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  async function confirm() {
    if (!target) return;
    if (!reason.trim()) {
      setError("A reason is required");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await adminForceCancel(target.id, reason);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
    } else {
      setTarget(null);
      setReason("");
      setLoading(false);
      router.refresh();
    }
  }

  async function confirmOverride() {
    if (!overrideTarget) return;
    if (!overrideReason.trim()) {
      setOverrideError("A reason is required");
      return;
    }
    setOverrideLoading(true);
    setOverrideError(null);
    const result = await noShowOverride(
      overrideTarget.id,
      overrideChoice,
      overrideReason,
    );
    if ("error" in result) {
      setOverrideError(result.error);
      setOverrideLoading(false);
    } else {
      setOverrideTarget(null);
      setOverrideReason("");
      setOverrideLoading(false);
      router.refresh();
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Bookings</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No bookings yet.</p>
      ) : (
        <Card padding={false} className="overflow-x-auto border border-border-subtle">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle text-left text-xs uppercase text-text-tertiary">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Offering</th>
                <th className="px-3 py-2">Parties</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs text-text-tertiary">
                    {shortId(r.id)}
                  </td>
                  <td className="px-3 py-2 text-white">{r.offering}</td>
                  <td className="px-3 py-2 text-text-secondary">
                    {r.fan} → {r.creator}
                  </td>
                  <td className="px-3 py-2 text-text-tertiary">
                    {r.start_at ? formatDateTime(r.start_at) : ""}
                  </td>
                  <td className="px-3 py-2 text-white">
                    ${((r.price_cents ?? 0) / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-pill px-2.5 py-0.5 text-xs ${statusClass(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.status === "confirmed" && (
                        <Button
                          size="small"
                          variant="destructive"
                          onClick={() => {
                            setTarget(r);
                            setReason("");
                            setError(null);
                          }}
                        >
                          Force cancel
                        </Button>
                      )}
                      {r.status === "no_show_fan" && (
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => {
                            setOverrideTarget(r);
                            setOverrideChoice("completed");
                            setOverrideReason("");
                            setOverrideError(null);
                          }}
                        >
                          Override
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={!!target}
        onClose={() => !loading && setTarget(null)}
        title={`Force cancel booking ${shortId(target?.id ?? "")}?`}
      >
        <p className="text-sm text-text-secondary">
          {target?.offering} · {target?.fan} → {target?.creator}. This issues a
          full refund to the fan and cannot be undone.
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
          <Button variant="destructive" onClick={confirm} disabled={loading}>
            {loading ? "Cancelling…" : "Confirm full refund + cancel"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setTarget(null)}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!overrideTarget}
        onClose={() => !overrideLoading && setOverrideTarget(null)}
        title={`Override no-show ${shortId(overrideTarget?.id ?? "")}?`}
      >
        <p className="text-sm text-text-secondary">
          {overrideTarget?.offering} · {overrideTarget?.fan} →{" "}
          {overrideTarget?.creator}. This booking is marked no_show_fan (fan did
          not join).
        </p>
        <div className="mt-3 flex flex-col gap-2 text-sm text-white">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="overrideChoice"
              checked={overrideChoice === "completed"}
              onChange={() => setOverrideChoice("completed")}
            />
            Mark completed (creator keeps payout)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="overrideChoice"
              checked={overrideChoice === "refund"}
              onChange={() => setOverrideChoice("refund")}
            />
            Refund fan (full)
          </label>
        </div>
        <Textarea
          className="mt-3"
          placeholder="Required reason"
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
          rows={3}
        />
        {overrideError && (
          <p className="mt-2 text-sm text-error">{overrideError}</p>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            variant="primary"
            onClick={confirmOverride}
            disabled={overrideLoading}
          >
            {overrideLoading ? "Applying…" : "Confirm override"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setOverrideTarget(null)}
            disabled={overrideLoading}
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
