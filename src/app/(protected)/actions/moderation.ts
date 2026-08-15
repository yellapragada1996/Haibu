"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings, creatorProfiles, reports, blocks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Report + block are safety actions available to either party of a booking.
// The target is always the *other* party: a guest reports/blocks the creator;
// a creator reports/blocks the guest.

async function resolveParties(bookingId: string, userId: string) {
  const [booking] = await db
    .select({
      id: bookings.id,
      fan_id: bookings.fan_id,
      creator_user_id: creatorProfiles.user_id,
    })
    .from(bookings)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .where(eq(bookings.id, bookingId));

  if (!booking) return null;
  if (booking.fan_id !== userId && booking.creator_user_id !== userId) {
    return null;
  }

  const isFan = userId === booking.fan_id;
  return {
    bookingId: booking.id,
    otherUserId: isFan ? booking.creator_user_id : booking.fan_id,
  };
}

export async function reportBooking(
  bookingId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = reason?.trim();
  if (!trimmed) return { error: "Please describe the issue" };

  const parties = await resolveParties(bookingId, user.id);
  if (!parties) return { error: "Booking not found" };

  await db.insert(reports).values({
    reporter_id: user.id,
    reported_user_id: parties.otherUserId,
    booking_id: parties.bookingId,
    reason: trimmed,
  });

  revalidatePath(`/bookings/${bookingId}`);
  return { success: true };
}

export async function blockUser(
  bookingId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parties = await resolveParties(bookingId, user.id);
  if (!parties) return { error: "Booking not found" };

  try {
    await db.insert(blocks).values({
      blocker_id: user.id,
      blocked_id: parties.otherUserId,
    });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") {
      return { error: "This user is already blocked" };
    }
    throw e;
  }

  revalidatePath(`/bookings/${bookingId}`);
  return { success: true };
}
