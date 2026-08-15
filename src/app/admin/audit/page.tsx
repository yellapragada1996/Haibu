import { db } from "@/db";
import { adminActions, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Card } from "@/components/ui/Card";

const adminUser = alias(users, "adminUser");
const targetUser = alias(users, "targetUser");

function shortId(id: string | null) {
  return id ? id.slice(0, 8) : "—";
}

export default async function AdminAuditPage() {
  const rows = await db
    .select({
      id: adminActions.id,
      action: adminActions.action,
      details: adminActions.details,
      reason: adminActions.reason,
      booking_id: adminActions.booking_id,
      target_user_id: adminActions.target_user_id,
      created_at: adminActions.created_at,
      admin_name: adminUser.display_name,
      target_name: targetUser.display_name,
    })
    .from(adminActions)
    .leftJoin(adminUser, eq(adminUser.id, adminActions.admin_id))
    .leftJoin(targetUser, eq(targetUser.id, adminActions.target_user_id))
    .orderBy(desc(adminActions.created_at))
    .limit(200);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Audit log</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No admin actions yet.</p>
      ) : (
        <Card padding={false} className="overflow-x-auto border border-border-subtle">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle text-left text-xs uppercase text-text-tertiary">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Details</th>
                <th className="px-3 py-2">Booking</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 align-top text-text-tertiary">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                  </td>
                  <td className="px-3 py-2 align-top text-white">{r.admin_name ?? "—"}</td>
                  <td className="px-3 py-2 align-top text-white">{r.action}</td>
                  <td className="px-3 py-2 align-top text-text-secondary">{r.details ?? "—"}</td>
                  <td className="px-3 py-2 align-top font-mono text-xs text-text-tertiary">
                    {shortId(r.booking_id)}
                  </td>
                  <td className="px-3 py-2 align-top text-text-secondary">
                    {r.target_name ?? "—"}
                  </td>
                  <td className="max-w-xs px-3 py-2 align-top text-text-secondary">
                    {r.reason}
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
