"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminForceCancel, noShowOverride } from "./actions";

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

function statusColor(s: string) {
  switch (s) {
    case "confirmed":
      return "bg-green-100 text-green-700";
    case "completed":
      return "bg-blue-100 text-blue-700";
    case "reserved":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-200 text-gray-600";
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
      <h1 className="mb-4 text-xl font-semibold">Bookings</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No bookings yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
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
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">{shortId(r.id)}</td>
                  <td className="px-3 py-2">{r.offering}</td>
                  <td className="px-3 py-2">
                    {r.fan} → {r.creator}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {r.start_at ? new Date(r.start_at).toLocaleString() : ""}
                  </td>
                  <td className="px-3 py-2">
                    ${((r.price_cents ?? 0) / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.status === "confirmed" && (
                        <button
                          onClick={() => {
                            setTarget(r);
                            setReason("");
                            setError(null);
                          }}
                          className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                        >
                          Force cancel
                        </button>
                      )}
                      {r.status === "no_show_fan" && (
                        <button
                          onClick={() => {
                            setOverrideTarget(r);
                            setOverrideChoice("completed");
                            setOverrideReason("");
                            setOverrideError(null);
                          }}
                          className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200"
                        >
                          Override
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="mb-2 font-semibold">
              Force cancel booking {shortId(target.id)}?
            </h2>
            <p className="mb-3 text-sm text-gray-600">
              {target.offering} · {target.fan} → {target.creator}. This issues a
              full refund to the fan and cannot be undone.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required reason"
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={confirm}
                disabled={loading}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {loading ? "Cancelling…" : "Confirm full refund + cancel"}
              </button>
              <button
                onClick={() => {
                  setTarget(null);
                  setError(null);
                }}
                disabled={loading}
                className="rounded bg-gray-200 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="mb-2 font-semibold">
              Override no-show {shortId(overrideTarget.id)}?
            </h2>
            <p className="mb-3 text-sm text-gray-600">
              {overrideTarget.offering} · {overrideTarget.fan} →{" "}
              {overrideTarget.creator}. This booking is marked no_show_fan (fan
              did not join).
            </p>
            <div className="mb-3 flex flex-col gap-2 text-sm">
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
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Required reason"
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            {overrideError && (
              <p className="mt-2 text-sm text-red-600">{overrideError}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={confirmOverride}
                disabled={overrideLoading}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {overrideLoading ? "Applying…" : "Confirm override"}
              </button>
              <button
                onClick={() => {
                  setOverrideTarget(null);
                  setOverrideError(null);
                }}
                disabled={overrideLoading}
                className="rounded bg-gray-200 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
