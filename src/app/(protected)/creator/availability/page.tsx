import { db } from "@/db";
import {
  availabilityWindows,
  availabilityBlocks,
  availabilityDateOverrides,
  creatorProfiles,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityManager } from "./AvailabilityManager";

export default async function CreatorAvailabilityPage() {
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
    return (
      <p className="text-text-secondary">
        Create your profile first before setting availability.
      </p>
    );
  }

  const [userRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, user.id));

  const windows = await db
    .select()
    .from(availabilityWindows)
    .where(eq(availabilityWindows.creator_id, profile.id))
    .orderBy(availabilityWindows.day_of_week, availabilityWindows.start_minute);

  const blocks = await db
    .select()
    .from(availabilityBlocks)
    .where(eq(availabilityBlocks.creator_id, profile.id))
    .orderBy(availabilityBlocks.start_at);

  const overrides = await db
    .select()
    .from(availabilityDateOverrides)
    .where(eq(availabilityDateOverrides.creator_id, profile.id))
    .orderBy(availabilityDateOverrides.date, availabilityDateOverrides.start_minute);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Availability</h1>
      <div className="mt-6">
        <AvailabilityManager
          windows={windows.map((w) => ({
            day_of_week: w.day_of_week,
            start_minute: w.start_minute,
            end_minute: w.end_minute,
          }))}
          blocks={blocks.map((b) => ({
            id: b.id,
            start_at: b.start_at?.toISOString() ?? "",
            end_at: b.end_at?.toISOString() ?? "",
          }))}
          overrides={overrides.map((o) => ({
            id: o.id,
            date: String(o.date).slice(0, 10),
            start_minute: o.start_minute,
            end_minute: o.end_minute,
          }))}
          timezone={userRow?.timezone ?? "UTC"}
        />
      </div>
    </div>
  );
}
