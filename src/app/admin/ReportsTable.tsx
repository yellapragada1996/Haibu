"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setReportStatus } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { formatDate, formatDateTime } from "@/lib/format";

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

function shortId(id: string) {
  return id.slice(0, 8);
}

function ageLabel(ts: string): string {
  if (!ts) return "—";
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ReportsTable({ rows }: { rows: ReportRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReportRow | null>(null);
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
      setSelected(null);
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
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => setSelected(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(r);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-bg-card-hover"
                >
                  <td className="max-w-xs px-3 py-2 align-middle text-white">
                    <span className="block truncate">{r.reason}</span>
                  </td>
                  <td className="px-3 py-2 align-middle text-text-secondary">
                    {r.reporter}
                  </td>
                  <td className="px-3 py-2 align-middle text-text-secondary">
                    {r.reported}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span className={`rounded-pill px-2.5 py-0.5 text-xs ${statusClass(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle text-text-tertiary">
                    {r.created_at ? formatDate(r.created_at) : ""}
                  </td>
                  <td className="px-3 py-2 text-right align-middle text-text-tertiary">
                    ›
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Report ${shortId(selected?.id ?? "")}`}
      >
        {selected && (
          <div>
            <p className="text-sm text-white">{selected.reason}</p>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-text-tertiary">Reporter</dt>
                <dd className="text-right text-white">{selected.reporter}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-tertiary">Reported</dt>
                <dd className="text-right text-white">{selected.reported}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-tertiary">Booking</dt>
                <dd className="text-right font-mono text-xs text-text-secondary">
                  {selected.booking_id ? shortId(selected.booking_id) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-tertiary">Created</dt>
                <dd className="text-right text-white">
                  {selected.created_at
                    ? `${formatDateTime(selected.created_at)} · ${ageLabel(selected.created_at)}`
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-border-subtle pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Set status
              </p>
              <div className="flex flex-wrap gap-1">
                {STATUSES.map((s) => (
                  <Button
                    key={s}
                    size="small"
                    variant="secondary"
                    disabled={busyId === selected.id || s === selected.status}
                    onClick={() => update(selected.id, s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
              {error && <p className="mt-2 text-sm text-error">{error}</p>}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
