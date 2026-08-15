"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUserSuspension } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { formatDate } from "@/lib/format";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  is_creator: boolean;
  role_admin: boolean;
  created_at: string;
  banned_until: string | null;
  sync_error: string | null;
};

export function UsersTable({ rows }: { rows: UserRow[] }) {
  const router = useRouter();
  const [suspendTarget, setSuspendTarget] = useState<UserRow | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function confirmSuspend() {
    if (!suspendTarget) return;
    if (!reason.trim()) {
      setError("A reason is required");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await setUserSuspension(suspendTarget.id, true, reason);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
    } else {
      setSuspendTarget(null);
      setReason("");
      setLoading(false);
      router.refresh();
    }
  }

  async function unsuspend(row: UserRow) {
    setBusyId(row.id);
    setError(null);
    const result = await setUserSuspension(row.id, false);
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
      <h1 className="mb-4 text-2xl font-bold text-white">Users</h1>
      {error && <p className="mb-3 text-sm text-error">{error}</p>}
      {rows[0]?.sync_error && (
        <p className="mb-3 text-sm text-error">
          Could not load suspension state: {rows[0].sync_error}
        </p>
      )}

      <Card padding={false} className="overflow-x-auto border border-border-subtle">
        <table className="w-full text-sm">
          <thead className="border-b border-border-subtle text-left text-xs uppercase text-text-tertiary">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((r) => {
              const suspended = !!r.banned_until;
              const roleLabel = r.role_admin
                ? "admin"
                : r.is_creator
                  ? "creator"
                  : "fan";
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-white">{r.display_name || "—"}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.email}</td>
                  <td className="px-3 py-2 text-text-secondary">{roleLabel}</td>
                  <td className="px-3 py-2">
                    {suspended ? (
                      <span className="text-error">suspended</span>
                    ) : (
                      <span className="text-live-green">active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-tertiary">
                    {r.created_at ? formatDate(r.created_at) : ""}
                  </td>
                  <td className="px-3 py-2">
                    {r.role_admin ? (
                      <span className="text-xs text-text-tertiary">—</span>
                    ) : suspended ? (
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={busyId === r.id}
                        onClick={() => unsuspend(r)}
                      >
                        Unsuspend
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="danger"
                        onClick={() => {
                          setSuspendTarget(r);
                          setReason("");
                          setError(null);
                        }}
                      >
                        Suspend
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!suspendTarget}
        onClose={() => !loading && setSuspendTarget(null)}
        title={`Suspend ${suspendTarget?.display_name || suspendTarget?.email || ""}?`}
      >
        <p className="text-sm text-text-secondary">
          This blocks {suspendTarget?.email} from signing in until you unsuspend
          them. It is reversible.
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
          <Button variant="danger" onClick={confirmSuspend} disabled={loading}>
            {loading ? "Suspending…" : "Confirm suspend"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setSuspendTarget(null)}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
