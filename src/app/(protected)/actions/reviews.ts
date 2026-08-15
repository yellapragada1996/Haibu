"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings, reviews } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Reviews are written by the guest (the booking's fan) only, and only once a
// booking has reached `completed`. The `booking_id` unique index on `reviews`
// is the hard backstop against double-reviewing; we also pre-check for a
// friendlier error message.

export async function submitReview(
  bookingId: string,
  rating: number,
  text?: string | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const r = Math.round(Number(rating));
  if (!Number.isFinite(r) || r < 1 || r > 5) {
    return { error: "Rating must be between 1 and 5" };
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      fan_id: bookings.fan_id,
      creator_id: bookings.creator_id, // already creator_profiles.id
      status: bookings.status,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return { error: "Booking not found" };
  if (booking.fan_id !== user.id) {
    return { error: "Only the guest can review this session" };
  }
  if (booking.status !== "completed") {
    return { error: "This session isn't completed yet" };
  }

  const trimmed = text?.trim();
  try {
    await db.insert(reviews).values({
      booking_id: booking.id,
      creator_id: booking.creator_id,
      rating: r,
      text: trimmed && trimmed.length > 0 ? trimmed : null,
    });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") {
      return { error: "You've already reviewed this session" };
    }
    throw e;
  }

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath(`/creators/${booking.creator_id}`);
  return { success: true };
}
