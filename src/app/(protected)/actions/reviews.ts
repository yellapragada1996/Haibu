"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings, reviews } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { REVIEW_WINDOW_MS } from "@/lib/review-tags";
import { isPgErrorCode } from "@/lib/pg-errors";

// ---------------------------------------------------------------------------
// Guest review — published immediately on submission.
// ---------------------------------------------------------------------------

export async function submitReview(
  bookingId: string,
  rating: number,
  text?: string | null,
  tags?: string[],
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

  const trimmed = text?.trim();
  if (trimmed && trimmed.length > 500) {
    return { error: "Review text must be 500 characters or fewer" };
  }

  const tagList = Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === "string" && t.length > 0).slice(0, 6)
    : [];

  const [booking] = await db
    .select({
      id: bookings.id,
      fan_id: bookings.fan_id,
      creator_id: bookings.creator_id,
      status: bookings.status,
      end_at: bookings.end_at,
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
  if (Date.now() > new Date(booking.end_at).getTime() + REVIEW_WINDOW_MS) {
    return { error: "The review period has ended" };
  }

  let reviewId: string;
  try {
    const inserted = await db
      .insert(reviews)
      .values({
        booking_id: booking.id,
        creator_id: booking.creator_id,
        rating: r,
        text: trimmed && trimmed.length > 0 ? trimmed : null,
        tags: tagList,
        reviewer_role: "guest",
        is_public: true,
        published_at: new Date(),
      })
      .returning({ id: reviews.id });
    reviewId = inserted[0].id;
  } catch (e: unknown) {
    if (isPgErrorCode(e, "23505")) {
      return { error: "You've already reviewed this session" };
    }
    throw e;
  }

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath(`/bookings`);
  revalidatePath(`/creators/${booking.creator_id}`);
  return { success: true };
}
