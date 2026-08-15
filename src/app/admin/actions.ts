"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { bookings, ledgerEntries, reports, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";

// ---------------------------------------------------------------------------
// Admin server actions. Every action re-checks role_admin (defense in depth —
// the /admin layout already gates, but a forged action call must still fail).
// ---------------------------------------------------------------------------

const REPORT_STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

// Returns the admin's user id, or null if the caller is not an admin.
async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [row] = await db
    .select({ role_admin: users.role_admin })
    .from(users)
    .where(eq(users.id, user.id));

  return row?.role_admin === true ? user.id : null;
}

export async function setReportStatus(
  reportId: string,
  status: ReportStatus,
): Promise<{ success: true } | { error: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: "Unauthorized" };
  if (!REPORT_STATUSES.includes(status)) return { error: "Invalid status" };

  await db.update(reports).set({ status }).where(eq(reports.id, reportId));

  revalidatePath("/admin");
  return { success: true };
}

export async function adminForceCancel(
  bookingId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: "Unauthorized" };

  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { error: "A reason is required" };

  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      price_cents: bookings.price_cents,
      platform_fee_cents: bookings.platform_fee_cents,
      stripe_payment_intent_id: bookings.stripe_payment_intent_id,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return { error: "Booking not found" };
  if (booking.status !== "confirmed") {
    return { error: "Only confirmed bookings can be force-cancelled" };
  }

  // confirmed -> cancelled_admin, guarded on current status (idempotent).
  // The reason is persisted on bookings.cancel_reason so it remains queryable.
  const result = await db
    .update(bookings)
    .set({
      status: "cancelled_admin",
      cancelled_by: "admin",
      cancel_reason: trimmed,
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed")));

  if (result.rowCount === 0) return { error: "Booking already processed" };

  // Full refund + ledger (mirrors the shapes used in actions/cancel.ts).
  // Ordering intentionally matches cancel.ts: terminal status first, then
  // refund — so a failed refund can't leave a booking in a re-cancellable state.
  if (booking.price_cents > 0 && booking.stripe_payment_intent_id) {
    await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: booking.price_cents,
      reason: "requested_by_customer",
    });

    try {
      await db.insert(ledgerEntries).values({
        booking_id: booking.id,
        type: "refund",
        amount_cents: -booking.price_cents,
        stripe_reference: booking.stripe_payment_intent_id,
        note: `refund: admin force-cancel — ${trimmed}`,
      });
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== "23505") throw e;
    }

    try {
      await db.insert(ledgerEntries).values({
        booking_id: booking.id,
        type: "platform_fee",
        amount_cents: -booking.platform_fee_cents,
        stripe_reference: `${booking.stripe_payment_intent_id}:fee_reversal`,
        note: `fee reversal: admin force-cancel — ${trimmed}`,
      });
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  return { success: true };
}

export async function setUserSuspension(
  userId: string,
  suspend: boolean,
): Promise<{ success: true } | { error: string }> {
  const adminId = await requireAdmin();
  if (!adminId) return { error: "Unauthorized" };
  if (userId === adminId) {
    return { error: "You cannot suspend your own account" };
  }

  // Supabase-native ban: '876000h' (~100 years) suspends, 'none' lifts it.
  const service = await createServiceClient();
  const { error } = await service.auth.admin.updateUserById(userId, {
    ban_duration: suspend ? "876000h" : "none",
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}
