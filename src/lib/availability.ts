import {
  availabilityWindows,
  availabilityBlocks,
  availabilityDateOverrides,
  bookings,
  offerings,
  creatorProfiles,
  users,
} from "@/db/schema";
import { eq, and, inArray, gte, lte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { addMinutes } from "date-fns";

const activeBookingStatuses = ["reserved", "confirmed", "completed"] as const;

// Maximum advance-booking window: slots cannot be generated further than
// 30 days out, regardless of what range the caller requests.
const MAX_BOOKING_WINDOW_DAYS = 30;

export interface TimeSlot {
  start_at: string; // ISO 8601 UTC
  end_at: string; // ISO 8601 UTC
}

export async function generateAvailableSlots(params: {
  creator_id: string;
  offering_id: string;
  from: Date;
  to: Date;
  min_lead_minutes?: number;
}): Promise<TimeSlot[]> {
  const { creator_id, offering_id, from, to, min_lead_minutes = 60 } = params;

  // Enforce the 30-day maximum booking window server-side.
  const now = new Date();
  const maxTo = addMinutes(now, MAX_BOOKING_WINDOW_DAYS * 24 * 60);
  const effectiveTo = to > maxTo ? maxTo : to;

  if (from >= effectiveTo) return [];

  const [profile] = await db
    .select({
      timezone: users.timezone,
      duration_minutes: offerings.duration_minutes,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .innerJoin(offerings, eq(offerings.creator_id, creatorProfiles.id))
    .where(
      and(
        eq(creatorProfiles.id, creator_id),
        eq(offerings.id, offering_id),
        isNull(offerings.deleted_at),
      ),
    );

  if (!profile) return [];

  const timezone = profile.timezone;
  const duration = profile.duration_minutes;
  if (![15, 30, 45, 60].includes(duration)) return [];

  const windows = await db
    .select()
    .from(availabilityWindows)
    .where(eq(availabilityWindows.creator_id, creator_id));

  const blocks = await db
    .select()
    .from(availabilityBlocks)
    .where(
      and(
        eq(availabilityBlocks.creator_id, creator_id),
        lte(availabilityBlocks.start_at, effectiveTo),
        gte(availabilityBlocks.end_at, from),
      ),
    );

  // Broad prefilter (with one day of padding for timezone boundaries) —
  // exact per-day matching happens below using creator-local date keys.
  const dateOverrides = await db
    .select()
    .from(availabilityDateOverrides)
    .where(
      and(
        eq(availabilityDateOverrides.creator_id, creator_id),
        gte(
          availabilityDateOverrides.date,
          new Date(from.getTime() - 86400000).toISOString().slice(0, 10),
        ),
        lte(
          availabilityDateOverrides.date,
          new Date(effectiveTo.getTime() + 86400000).toISOString().slice(0, 10),
        ),
      ),
    );

  const activeBookings = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.creator_id, creator_id),
        inArray(bookings.status, activeBookingStatuses),
        lte(bookings.start_at, effectiveTo),
        gte(bookings.end_at, from),
      ),
    );

  const cutoff = addMinutes(now, min_lead_minutes);
  const slots: TimeSlot[] = [];

  // Determine local calendar date range in the creator's timezone
  const localFrom = toZonedTime(from, timezone);
  const localTo = toZonedTime(effectiveTo, timezone);

  // Clamp to calendar-day boundaries
  const startDate = new Date(
    localFrom.getFullYear(),
    localFrom.getMonth(),
    localFrom.getDate(),
  );
  const endDate = new Date(
    localTo.getFullYear(),
    localTo.getMonth(),
    localTo.getDate(),
  );

  // Index overrides by creator-local date string for O(1) lookups
  const overrideByDate = new Map<string, typeof dateOverrides>();
  for (const o of dateOverrides) {
    const key = String(o.date).slice(0, 10);
    const existing = overrideByDate.get(key) ?? [];
    existing.push(o);
    overrideByDate.set(key, existing);
  }

  // Iterate local calendar days
  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setDate(d.getDate() + 1)
  ) {
    const localDow = d.getDay(); // 0=Sun … 6=Sat

    // Local midnight of this calendar day (and the next), converted to UTC
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const localMidnight = fromZonedTime(`${dateKey}T00:00:00`, timezone);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDateKey = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;
    const nextMidnight = fromZonedTime(`${nextDateKey}T00:00:00`, timezone);

    // PRECEDENCE RULE (haibu-availability-spec.md §3):
    // 1. BLOCK: a block covering the ENTIRE creator-local day kills the
    //    whole date, full stop — block always wins over an override.
    //    Partial blocks (raw data only) fall through to the per-slot filter.
    const localMidnightMs = localMidnight.getTime();
    const nextMidnightMs = nextMidnight.getTime();
    const fullyBlocked = blocks.some(
      (b) =>
        new Date(b.start_at!).getTime() <= localMidnightMs &&
        new Date(b.end_at!).getTime() >= nextMidnightMs,
    );
    if (fullyBlocked) continue;

    // 2. OVERRIDE: if this date has availability_date_overrides rows, use
    //    ONLY those as the day's windows, ignoring the recurring pattern.
    const dayOverrideRows = overrideByDate.get(dateKey);

    // 3. Else fall back to recurring weekly windows.
    const matchingWindows =
      dayOverrideRows && dayOverrideRows.length > 0
        ? dayOverrideRows.map((o) => ({
            start_minute: o.start_minute,
            end_minute: o.end_minute,
          }))
        : windows.filter((w) => w.day_of_week === localDow);

    if (matchingWindows.length === 0) continue;

    for (const w of matchingWindows) {
      const windowStartUtc = addMinutes(localMidnight, w.start_minute);
      const windowEndUtc = addMinutes(localMidnight, w.end_minute);

      for (
        let slotStart = windowStartUtc;
        addMinutes(slotStart, duration) <= windowEndUtc;
        slotStart = addMinutes(slotStart, duration)
      ) {
        const slotEnd = addMinutes(slotStart, duration);

        if (slotEnd <= cutoff) continue;
        if (slotStart < from) continue;
        if (slotEnd > effectiveTo) continue;

        const overlapsBlock = blocks.some(
          (b) => slotStart < b.end_at! && slotEnd > b.start_at!,
        );
        if (overlapsBlock) continue;

        const overlapsBooking = activeBookings.some(
          (b) => slotStart < b.end_at! && slotEnd > b.start_at!,
        );
        if (overlapsBooking) continue;

        slots.push({
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
        });
      }
    }
  }

  return slots;
}

// Fast "available today" check — one SQL query returns creator ids whose
// availability window covers today (in the creator's local timezone) and
// extends at least min_lead_minutes past the current local time.
export async function getAvailableTodayCreatorIds(
  minLeadMinutes = 60,
): Promise<Set<string>> {
  const result = await db.execute(sql`
    SELECT DISTINCT aw.creator_id AS id
    FROM availability_windows aw
    JOIN creator_profiles cp ON cp.id = aw.creator_id
    JOIN users u ON u.id = cp.user_id
    WHERE cp.is_published = true
      AND aw.day_of_week = EXTRACT(DOW FROM NOW() AT TIME ZONE u.timezone)::int
      AND aw.start_minute <=
        (EXTRACT(HOUR FROM NOW() AT TIME ZONE u.timezone)::int * 60
         + EXTRACT(MINUTE FROM NOW() AT TIME ZONE u.timezone)::int)
      AND aw.end_minute >=
        (EXTRACT(HOUR FROM NOW() AT TIME ZONE u.timezone)::int * 60
         + EXTRACT(MINUTE FROM NOW() AT TIME ZONE u.timezone)::int) + ${minLeadMinutes}
  `);
  const rows = result.rows as unknown as { id: string }[];
  return new Set(rows.map((r) => r.id));
}
