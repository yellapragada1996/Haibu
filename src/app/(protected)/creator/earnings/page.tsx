import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { creatorProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Kpi } from "@/components/ui/Kpi";
import { formatCents, getCreatorEarnings } from "@/lib/creator-studio";

function fmtDate(d: Date | string, tz: string): string {
  return new Date(d).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
}

export default async function CreatorEarningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));

  if (!profile) {
    return <p className="text-sm text-text-secondary">Create your profile first.</p>;
  }

  const [userRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, user.id));
  const tz = userRow?.timezone ?? "UTC";

  const earnings = await getCreatorEarnings(profile.id);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Earnings</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi
          label="Total earned"
          value={formatCents(earnings.totalEarned)}
          hint="Your cut from every completed session."
        />
        <Kpi
          label="Pending"
          value={formatCents(earnings.pending)}
          hint="Earned but not yet paid out — on its way."
        />
        <Kpi
          label="Paid out"
          value={formatCents(earnings.paidOut)}
          hint="Already transferred to your connected Stripe account."
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-white">Sessions</h2>
        {earnings.sessions.length === 0 ? (
          <Card>
            <p className="text-sm text-text-secondary">
              No completed sessions yet. Earnings appear here after your first session.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {earnings.sessions.map((s) => {
              const badge =
                s.status === "paid" ? (
                  <Badge variant="confirmed" label="Paid" />
                ) : s.status === "on_hold" ? (
                  <Badge variant="error" label="On hold" />
                ) : (
                  <Badge variant="pending" label="Pending" />
                );
              return (
                <Card key={s.id} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{s.offering}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {s.startAt ? fmtDate(s.startAt, tz) : ""} · {s.guest} · {s.duration} min
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-bold text-white">
                      {formatCents(s.amount)}
                    </span>
                    {badge}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
