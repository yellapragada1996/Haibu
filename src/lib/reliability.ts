import { db } from "@/db";
import { bookings, creatorProfiles, users } from "@/db/schema";
import { and, count, eq, gte, or } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Creator reliability flag (§4) — creators with too many cancellations/no-shows
// in a rolling window are flagged for admin review (no auto-action).
//
// Counts genuine creator-initiated cancellations (cancelled_creator with
// cancelled_by = 'creator') AND creator no-shows (no_show_creator). Mutual
// no-shows (cancelled_creator with cancelled_by = 'system') are excluded.
// ---------------------------------------------------------------------------

export const RELIABILITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const RELIABILITY_FLAG_THRESHOLD = 3; // "3 or more" (§4)

export interface ReliabilityFlag {
  creator_id: string;
  user_id: string;
  display_name: string;
  email: string;
  count: number;
}

export async function getReliabilityFlags(): Promise<ReliabilityFlag[]> {
  const cutoff = new Date(Date.now() - RELIABILITY_WINDOW_MS);
  return db
    .select({
      creator_id: bookings.creator_id,
      user_id: creatorProfiles.user_id,
      display_name: users.display_name,
      email: users.email,
      count: count(),
    })
    .from(bookings)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(
      and(
        or(
          eq(bookings.status, "no_show_creator"),
          and(
            eq(bookings.status, "cancelled_creator"),
            eq(bookings.cancelled_by, "creator"),
          ),
        ),
        gte(bookings.end_at, cutoff),
      ),
    )
    .groupBy(
      bookings.creator_id,
      creatorProfiles.user_id,
      users.display_name,
      users.email,
    )
    .having(gte(count(), RELIABILITY_FLAG_THRESHOLD));
}
