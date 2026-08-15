import { db } from "@/db";
import { reports, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ReportsTable } from "../ReportsTable";

const reportedUser = alias(users, "reportedUser");

export default async function AdminReportsPage() {
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

  return <ReportsTable rows={data} />;
}
