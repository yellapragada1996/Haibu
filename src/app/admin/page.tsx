import { db } from "@/db";
import {
  adminActions,
  bookings,
  creatorProfiles,
  ledgerEntries,
  reports,
  users,
} from "@/db/schema";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Card } from "@/components/ui/Card";
import { getReliabilityFlags, RELIABILITY_WINDOW_MS } from "@/lib/reliability";
import { ReviewActions } from "./ReviewActions";

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
      <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
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

  // Creators flagged for reliability review (§4) — cancellations/no-shows in a
  // rolling window. Flag-for-review only; no auto-action.
  const reliabilityFlags = await getReliabilityFlags();
  const reliabilityDays = Math.round(RELIABILITY_WINDOW_MS / 86400000);

  // Sessions where the creator partially delivered (Phase 4) — needs_review,
  // skipped by the payout sweep until an admin resolves them.
  const reviewRows = await db
    .select({
      id: bookings.id,
      start_at: bookings.start_at,
      creator_name: users.display_name,
    })
    .from(bookings)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(eq(bookings.needs_review, true))
    .orderBy(asc(bookings.start_at))
    .limit(20);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-text-primary">Overview</h1>

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
          title="Confirmed, completed, or guest no-show bookings"
          value={String(Number(settledBookings?.n ?? 0))}
        />
        <Kpi
          label="Gross sales"
          title="Total charged across booked sessions"
          value={money(Number(gmv?.n ?? 0))}
        />
        <Kpi
          label="Refunds issued"
          title="Total refunded to guests"
          value={money(Number(refunds?.n ?? 0))}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-text-primary">
            Open reports
          </h2>
          {openRows.length === 0 ? (
            <p className="text-sm text-text-secondary">No open reports</p>
          ) : (
            <Card padding={false} className="divide-y divide-border-subtle">
              {openRows.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <p className="truncate text-sm text-text-primary">{r.reason}</p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {r.reporter} → {r.reported} · {ageLabel(r.created_at)}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-text-primary">
            Recent admin actions
          </h2>
          {recentActions.length === 0 ? (
            <p className="text-sm text-text-secondary">No actions yet.</p>
          ) : (
            <Card padding={false} className="divide-y divide-border-subtle">
              {recentActions.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <p className="text-sm text-text-primary">
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

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">
          Creator reliability flags
        </h2>
        {reliabilityFlags.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No creators have crossed the reliability threshold.
          </p>
        ) : (
          <Card padding={false} className="divide-y divide-border-subtle">
            {reliabilityFlags.map((f) => (
              <div key={f.creator_id} className="px-4 py-3">
                <p className="text-sm text-text-primary">
                  {f.display_name}{" "}
                  <span className="text-text-secondary">· {f.email}</span>
                </p>
                <p className="mt-1 text-xs text-text-tertiary">
                  {f.count} cancellations/no-shows in the last {reliabilityDays} days
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">
          Sessions needing review
        </h2>
        {reviewRows.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No sessions flagged for review.
          </p>
        ) : (
          <Card padding={false} className="divide-y divide-border-subtle">
            {reviewRows.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <p className="text-sm text-text-primary">
                  {r.creator_name}{" "}
                  <span className="text-text-secondary">· {r.id.slice(0, 8)}</span>
                </p>
                <p className="mt-1 text-xs text-text-tertiary">
                  {r.start_at ? new Date(r.start_at).toLocaleString("en-US", { timeZone: "UTC" }) : "—"} UTC · creator partially delivered
                </p>
                <div className="mt-2">
                  <ReviewActions bookingId={r.id} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
