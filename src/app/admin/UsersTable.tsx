"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUserSuspension } from "./actions";

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(row: UserRow) {
    const suspending = !row.banned_until;
    setBusyId(row.id);
    setError(null);
    const result = await setUserSuspension(row.id, suspending);
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
      <h1 className="mb-4 text-xl font-semibold">Users</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {rows[0]?.sync_error && (
        <p className="mb-3 text-sm text-amber-600">
          Could not load suspension state: {rows[0].sync_error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const suspended = !!r.banned_until;
              const roleLabel = r.role_admin
                ? "admin"
                : r.is_creator
                  ? "creator"
                  : "fan";
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.display_name || "—"}</td>
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">{roleLabel}</td>
                  <td className="px-3 py-2">
                    {suspended ? (
                      <span className="text-red-600">suspended</span>
                    ) : (
                      <span className="text-green-600">active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString()
                      : ""}
                  </td>
                  <td className="px-3 py-2">
                    {r.role_admin ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <button
                        onClick={() => toggle(r)}
                        disabled={busyId === r.id}
                        className={`rounded px-2 py-1 text-xs disabled:opacity-50 ${
                          suspended
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-700 hover:bg-red-200"
                        }`}
                      >
                        {suspended ? "Unsuspend" : "Suspend"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
