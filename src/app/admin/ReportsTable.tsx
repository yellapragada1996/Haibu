"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setReportStatus } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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

function statusClass(s: string) {
  switch (s) {
    case "open":
      return "border border-accent text-accent";
    case "reviewed":
      return "border border-live-green text-live-green";
    case "actioned":
      return "bg-live-green text-black";
    case "dismissed":
      return "border border-text-tertiary text-text-tertiary";
    default:
      return "border border-text-tertiary text-text-tertiary";
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
      <h1 className="mb-4 text-2xl font-bold text-white">Reports</h1>
      {error && <p className="mb-3 text-sm text-error">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No reports yet.</p>
      ) : (
        <Card padding={false} className="overflow-x-auto border border-border-subtle">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle text-left text-xs uppercase text-text-tertiary">
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
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-xs px-3 py-2 align-top text-white">{r.reason}</td>
                  <td className="px-3 py-2 align-top text-text-secondary">{r.reporter}</td>
                  <td className="px-3 py-2 align-top text-text-secondary">{r.reported}</td>
                  <td className="px-3 py-2 align-top font-mono text-xs text-text-tertiary">
                    {r.booking_id ? r.booking_id.slice(0, 8) : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={`rounded-pill px-2.5 py-0.5 text-xs ${statusClass(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-text-tertiary">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.map((s) => (
                        <Button
                          key={s}
                          size="small"
                          variant="secondary"
                          disabled={busyId === r.id || s === r.status}
                          onClick={() => update(r.id, s)}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
