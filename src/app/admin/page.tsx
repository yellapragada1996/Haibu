import { db } from "@/db";
import {
  adminActions,
  bookings,
  ledgerEntries,
  reports,
  users,
} from "@/db/schema";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Card } from "@/components/ui/Card";

const reportedUser = alias(users, "reportedUser");
const adminUser = alias(users, "adminUser");

const SETTLED = sql`${bookings.status} IN ('confirmed', 'completed', 'no_show_fan')`;

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function ageLabel(ts: Date | null): string {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Kpi({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <Card title={title}>
      <p className="text-xs uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const [openReports] = await db
    .select({ n: count() })
    .from(reports)
    .where(eq(reports.status, "open"));
  const [totalUsers] = await db.select({ n: count() }).from(users);
  const [totalCreators] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.is_creator, true));
  const [settledBookings] = await db
    .select({ n: count() })
    .from(bookings)
    .where(SETTLED);
  const [gmv] = await db
    .select({ n: sql<number>`COALESCE(SUM(${bookings.price_cents}), 0)` })
    .from(bookings)
    .where(SETTLED);
  const [refunds] = await db
    .select({ n: sql<number>`COALESCE(SUM(ABS(${ledgerEntries.amount_cents})), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.type, "refund"));

  // Open reports, oldest first (moderation SLA: oldest needs attention).
  const openRows = await db
    .select({
      id: reports.id,
      reason: reports.reason,
      created_at: reports.created_at,
      reporter: users.display_name,
      reported: reportedUser.display_name,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporter_id))
    .innerJoin(reportedUser, eq(reportedUser.id, reports.reported_user_id))
    .where(eq(reports.status, "open"))
    .orderBy(asc(reports.created_at))
    .limit(8);

  // Recent admin actions (the audit trail, newest first).
  const recentActions = await db
    .select({
      id: adminActions.id,
      action: adminActions.action,
      details: adminActions.details,
      reason: adminActions.reason,
      created_at: adminActions.created_at,
      admin_name: adminUser.display_name,
    })
    .from(adminActions)
    .leftJoin(adminUser, eq(adminUser.id, adminActions.admin_id))
    .orderBy(desc(adminActions.created_at))
    .limit(8);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Overview</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi
          label="Open reports"
          title="Reports still awaiting review"
          value={String(Number(openReports?.n ?? 0))}
        />
        <Kpi
          label="Total users"
          title="All registered users"
          value={String(Number(totalUsers?.n ?? 0))}
        />
        <Kpi
          label="Creators"
          title="Users with a creator profile"
          value={String(Number(totalCreators?.n ?? 0))}
        />
        <Kpi
          label="Booked sessions"
          title="Confirmed, completed, or fan no-show bookings"
          value={String(Number(settledBookings?.n ?? 0))}
        />
        <Kpi
          label="Gross sales"
          title="Total charged across booked sessions"
          value={money(Number(gmv?.n ?? 0))}
        />
        <Kpi
          label="Refunds issued"
          title="Total refunded to fans"
          value={money(Number(refunds?.n ?? 0))}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Open reports
          </h2>
          {openRows.length === 0 ? (
            <p className="text-sm text-text-secondary">No open reports</p>
          ) : (
            <Card padding={false} className="divide-y divide-border-subtle">
              {openRows.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <p className="truncate text-sm text-white">{r.reason}</p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {r.reporter} → {r.reported} · {ageLabel(r.created_at)}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Recent admin actions
          </h2>
          {recentActions.length === 0 ? (
            <p className="text-sm text-text-secondary">No actions yet.</p>
          ) : (
            <Card padding={false} className="divide-y divide-border-subtle">
              {recentActions.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <p className="text-sm text-white">
                    <span className="font-medium">{a.action}</span>
                    {a.details ? (
                      <span className="text-text-secondary"> · {a.details}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {a.admin_name ?? "unknown"} · {ageLabel(a.created_at)}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
