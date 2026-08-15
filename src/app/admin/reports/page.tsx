import { db } from "@/db";
import { reports, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ReportsTable } from "../ReportsTable";
import { FilterChips } from "../FilterChips";

const reportedUser = alias(users, "reportedUser");

const STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = STATUSES.includes(status as (typeof STATUSES)[number])
    ? (status as (typeof STATUSES)[number])
    : undefined;

  const cond = filter ? eq(reports.status, filter) : undefined;

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
    .limit(200);

  const data = rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    status: r.status,
    created_at: r.created_at ? r.created_at.toISOString() : "",
    booking_id: r.booking_id ?? null,
    reporter: r.reporter_name || r.reporter_email,
    reported: r.reported_name || r.reported_email,
  }));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Reports</h1>
      <FilterChips
        base="/admin/reports"
        param="status"
        current={filter}
        options={[
          { label: "All", value: "" },
          { label: "Open", value: "open" },
          { label: "Reviewed", value: "reviewed" },
          { label: "Actioned", value: "actioned" },
          { label: "Dismissed", value: "dismissed" },
        ]}
      />
      <ReportsTable rows={data} />
    </div>
  );
}
