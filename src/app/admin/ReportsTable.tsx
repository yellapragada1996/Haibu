"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setReportStatus } from "./actions";

type ReportRow = {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  booking_id: string | null;
  reporter: string;
  reported: string;
};

const STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;

function statusColor(s: string) {
  switch (s) {
    case "open":
      return "bg-red-100 text-red-700";
    case "reviewed":
      return "bg-yellow-100 text-yellow-700";
    case "actioned":
      return "bg-green-100 text-green-700";
    case "dismissed":
      return "bg-gray-200 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function ReportsTable({ rows }: { rows: ReportRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(id: string, status: string) {
    setBusyId(id);
    setError(null);
    const result = await setReportStatus(id, status as (typeof STATUSES)[number]);
    if ("error" in result) {
      setError(result.error);
      setBusyId(null);
    } else {
      setBusyId(null);
      router.refresh();
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Reports</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No reports yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Reporter</th>
                <th className="px-3 py-2">Reported</th>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-xs px-3 py-2 align-top">{r.reason}</td>
                  <td className="px-3 py-2 align-top">{r.reporter}</td>
                  <td className="px-3 py-2 align-top">{r.reported}</td>
                  <td className="px-3 py-2 align-top font-mono text-xs">
                    {r.booking_id ? r.booking_id.slice(0, 8) : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-gray-500">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString()
                      : ""}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          disabled={busyId === r.id || s === r.status}
                          onClick={() => update(r.id, s)}
                          className={`rounded px-2 py-1 text-xs ${
                            s === r.status
                              ? "bg-gray-200 text-gray-500"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          } disabled:opacity-50`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
