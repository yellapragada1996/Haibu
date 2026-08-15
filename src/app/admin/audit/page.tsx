import { db } from "@/db";
import { adminActions, users } from "@/db/schema";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Card } from "@/components/ui/Card";
import { AdminListControls } from "../AdminListControls";
import { Pager } from "../Pager";
import { formatDateTime } from "@/lib/format";

const adminUser = alias(users, "adminUser");
const targetUser = alias(users, "targetUser");
const PAGE_SIZE = 50;

function shortId(id: string | null) {
  return id ? id.slice(0, 8) : "—";
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; page?: string }>;
}) {
  const { q: rawQ, action = "", page: rawPage } = await searchParams;
  const q = rawQ?.trim() ?? "";
  const page = Math.max(1, Number(rawPage) || 1);

  const like = q ? `%${q}%` : null;

  const actionCond =
    action === "no_show_override" || action === "suspend" || action === "unsuspend"
      ? eq(adminActions.action, action)
      : undefined;

  const searchCond = like
    ? or(
        ilike(adminActions.action, like),
        ilike(adminActions.reason, like),
        ilike(adminUser.display_name, like),
        ilike(targetUser.display_name, like),
        sql`${adminActions.booking_id}::text ILIKE ${like}`,
      )
    : undefined;

  const conds: SQL[] = [];
  if (actionCond) conds.push(actionCond);
  if (searchCond) conds.push(searchCond);
  const cond = conds.length ? and(...conds) : undefined;

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
    .where(cond)
    .orderBy(desc(adminActions.created_at))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const pagerParams: Record<string, string> = {};
  if (q) pagerParams.q = q;
  if (action) pagerParams.action = action;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Audit log</h1>
      <AdminListControls
        base="/admin/audit"
        param="action"
        placeholder="Search by action, reason, or name"
        q={q}
        filter={action}
        options={[
          { label: "All", value: "" },
          { label: "No-show override", value: "no_show_override" },
          { label: "Suspend", value: "suspend" },
          { label: "Unsuspend", value: "unsuspend" },
        ]}
      />

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
                    {r.created_at ? formatDateTime(r.created_at.toISOString()) : ""}
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

      <Pager base="/admin/audit" params={pagerParams} page={page} hasNext={rows.length === PAGE_SIZE} />
    </div>
  );
}
