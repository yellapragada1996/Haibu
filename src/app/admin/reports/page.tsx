import { db } from "@/db";
import { reports, users } from "@/db/schema";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ReportsTable } from "../ReportsTable";
import { AdminListControls } from "../AdminListControls";
import { Pager } from "../Pager";
import { EmptyState } from "../EmptyState";

const reportedUser = alias(users, "reportedUser");
const STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;
const PAGE_SIZE = 50;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q: rawQ, status = "", page: rawPage } = await searchParams;
  const q = rawQ?.trim() ?? "";
  const page = Math.max(1, Number(rawPage) || 1);
  const filter = STATUSES.includes(status as (typeof STATUSES)[number])
    ? (status as (typeof STATUSES)[number])
    : "";

  const like = q ? `%${q}%` : null;

  const statusCond = filter ? eq(reports.status, filter) : undefined;
  const searchCond = like
    ? or(
        ilike(reports.reason, like),
        ilike(users.display_name, like),
        ilike(reportedUser.display_name, like),
        sql`${reports.id}::text ILIKE ${like}`,
        sql`${reports.booking_id}::text ILIKE ${like}`,
      )
    : undefined;

  const conds: SQL[] = [];
  if (statusCond) conds.push(statusCond);
  if (searchCond) conds.push(searchCond);
  const cond = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: reports.id,
      reason: reports.reason,
      status: reports.status,
      created_at: reports.created_at,
      booking_id: reports.booking_id,
      reporter_name: users.display_name,
      reporter_email: users.email,
      reported_name: reportedUser.display_name,
      reported_email: reportedUser.email,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporter_id))
    .innerJoin(reportedUser, eq(reportedUser.id, reports.reported_user_id))
    .where(cond)
    .orderBy(desc(reports.created_at))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const data = rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    status: r.status,
    created_at: r.created_at ? r.created_at.toISOString() : "",
    booking_id: r.booking_id ?? null,
    reporter: r.reporter_name || r.reporter_email,
    reported: r.reported_name || r.reported_email,
  }));

  const pagerParams: Record<string, string> = {};
  if (q) pagerParams.q = q;
  if (filter) pagerParams.status = filter;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-text-primary">Reports</h1>
      <AdminListControls
        base="/admin/reports"
        param="status"
        placeholder="Search by reason, name, or ID"
        q={q}
        filter={filter}
        options={[
          { label: "All", value: "" },
          { label: "Open", value: "open" },
          { label: "Reviewed", value: "reviewed" },
          { label: "Actioned", value: "actioned" },
          { label: "Dismissed", value: "dismissed" },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState
          label="reports"
          q={q}
          clearHref={filter ? `/admin/reports?status=${encodeURIComponent(filter)}` : "/admin/reports"}
        />
      ) : (
        <>
          <ReportsTable rows={data} />
          <Pager base="/admin/reports" params={pagerParams} page={page} hasNext={rows.length === PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
