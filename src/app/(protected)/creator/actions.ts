"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { creatorProfiles, offerings, availabilityWindows, availabilityBlocks, availabilityDateOverrides, users, bookings } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCategories } from "@/lib/categories";
import { stripe } from "@/lib/stripe";
import { reconcileCreatorOnboarding } from "@/lib/creator-onboarding";
import { STRIPE_EXPRESS_COUNTRY_CODES } from "@/lib/stripe-countries";
import { fromZonedTime } from "date-fns-tz";
import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function upsertCreatorProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const bio = formData.get("bio") as string | null;
  const displayName = (formData.get("display_name") as string | null)?.trim() ?? null;

  const existing = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));

  if (existing.length > 0) {
    await db
      .update(creatorProfiles)
      .set({
        bio: bio ?? undefined,
      })
      .where(eq(creatorProfiles.user_id, user.id));
  } else {
    await db.insert(creatorProfiles).values({
      user_id: user.id,
      bio: bio ?? null,
      // Category is no longer chosen at profile creation — it's derived
      // from offerings (see Offerings tab). Default until an offering exists.
      category: "casual_talk",
    });
  }

  // Keep the users.is_creator flag in sync — the NavBar and dashboard read it.
  // Also persist the display name (part of the public profile).
  const userUpdates: Record<string, unknown> = { is_creator: true };
  if (displayName && displayName.length >= 2) {
    userUpdates.display_name = displayName;
  }
  await db.update(users).set(userUpdates).where(eq(users.id, user.id));

  revalidatePath("/creator/profile");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Offerings
// ---------------------------------------------------------------------------

export async function createOffering(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));
  if (!profile) return { error: "Create a profile first" };

  const title = formData.get("title") as string;
  const category = formData.get("category") as string;
  const durationMinutes = parseInt(formData.get("duration_minutes") as string, 10);
  const priceDollars = parseFloat(formData.get("price_dollars") as string);

  if (!title || title.trim().length === 0) return { error: "Title required" };
  const categorySlugs = (await getCategories()).map((c) => c.slug);
  if (!categorySlugs.includes(category)) return { error: "Invalid category" };
  if (![15, 30, 45, 60].includes(durationMinutes)) return { error: "Invalid duration" };
  if (isNaN(priceDollars) || priceDollars < 5 || priceDollars > 500) {
    return { error: "Price must be between $5.00 and $500.00" };
  }

  const priceCents = Math.round(priceDollars * 100);

  await db.insert(offerings).values({
    creator_id: profile.id,
    title: title.trim(),
    category,
    duration_minutes: durationMinutes,
    price_cents: priceCents,
  });

  revalidatePath("/creator/offerings");
  return { success: true };
}

export async function updateOffering(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = formData.get("title") as string;
  const priceDollars = parseFloat(formData.get("price_dollars") as string);

  const updates: Record<string, unknown> = {};
  if (title && title.trim().length > 0) updates.title = title.trim();
  if (!isNaN(priceDollars) && priceDollars >= 5 && priceDollars <= 500) {
    updates.price_cents = Math.round(priceDollars * 100);
  }

  if (Object.keys(updates).length === 0) return { error: "No changes" };

  await db.update(offerings).set(updates).where(eq(offerings.id, id));
  revalidatePath("/creator/offerings");
  return { success: true };
}

export async function deactivateOffering(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await db
    .update(offerings)
    .set({ is_active: false })
    .where(eq(offerings.id, id));

  revalidatePath("/creator/offerings");
  return { success: true };
}

export async function reactivateOffering(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await db
    .update(offerings)
    .set({ is_active: true })
    .where(eq(offerings.id, id));

  revalidatePath("/creator/offerings");
  return { success: true };
}

export async function deleteOffering(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Unified delete: zero bookings → hard delete; with bookings → soft delete
  // (is_active = false AND deleted_at = NOW()). Soft-deleted offerings are
  // permanently invisible to the creator; the row persists only so past
  // bookings can still display what was purchased.
  const [result] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(eq(bookings.offering_id, id));

  if (Number(result?.c ?? 0) > 0) {
    await db
      .update(offerings)
      .set({ is_active: false, deleted_at: sql`NOW()` })
      .where(eq(offerings.id, id));
  } else {
    await db.delete(offerings).where(eq(offerings.id, id));
  }

  revalidatePath("/creator/offerings");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Availability — combined staged save (delete-and-reinsert, one transaction)
// ---------------------------------------------------------------------------

export async function saveAvailability(
  windows: { day_of_week: number; start_minute: number; end_minute: number }[],
  blocks: { start_at: string; end_at: string }[],
  overrides: { date: string; start_minute: number; end_minute: number }[],
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));
  if (!profile) return { error: "Create a profile first" };

  const [creatorUser] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, user.id));
  const timezone = creatorUser?.timezone ?? "UTC";

  // Validate windows
  for (const w of windows) {
    if (w.day_of_week < 0 || w.day_of_week > 6) return { error: "Invalid day" };
    if (w.start_minute < 0 || w.start_minute >= 1440) return { error: "Invalid start time" };
    if (w.end_minute <= w.start_minute || w.end_minute > 1440) {
      return { error: "End time must be after start time" };
    }
  }

  // Validate blocks (raw local date strings from the UI)
  for (const b of blocks) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.start_at) || !/^\d{4}-\d{2}-\d{2}$/.test(b.end_at)) {
      return { error: "Invalid time off dates" };
    }
    if (b.end_at < b.start_at) {
      return { error: "Time off end date must be after start date" };
    }
  }

  // Validate overrides
  for (const o of overrides) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return { error: "Invalid override date" };
    if (o.start_minute < 0 || o.start_minute >= 1440) return { error: "Invalid override start time" };
    if (o.end_minute <= o.start_minute || o.end_minute > 1440) {
      return { error: "Override end time must be after start time" };
    }
  }

  // Delete-and-reinsert is safe here: all three tables are pure configuration
  // with no FK dependents and no history to preserve. Every statement is
  // scoped to THIS creator's rows.
  await db.transaction(async (tx) => {
    await tx
      .delete(availabilityWindows)
      .where(eq(availabilityWindows.creator_id, profile.id));
    if (windows.length > 0) {
      await tx.insert(availabilityWindows).values(
        windows.map((w) => ({
          creator_id: profile.id,
          day_of_week: w.day_of_week,
          start_minute: w.start_minute,
          end_minute: w.end_minute,
        })),
      );
    }

    await tx
      .delete(availabilityBlocks)
      .where(eq(availabilityBlocks.creator_id, profile.id));
    if (blocks.length > 0) {
      await tx.insert(availabilityBlocks).values(
        blocks.map((b) => ({
          creator_id: profile.id,
          // "All day" is local to the creator: store the full local calendar
          // day as UTC instants (local midnight → next local midnight, DST-safe)
          start_at: fromZonedTime(`${b.start_at}T00:00:00`, timezone),
          end_at: fromZonedTime(`${b.end_at}T00:00:00`, timezone),
        })),
      );
    }

    await tx
      .delete(availabilityDateOverrides)
      .where(eq(availabilityDateOverrides.creator_id, profile.id));
    if (overrides.length > 0) {
      await tx.insert(availabilityDateOverrides).values(
        overrides.map((o) => ({
          creator_id: profile.id,
          date: o.date,
          start_minute: o.start_minute,
          end_minute: o.end_minute,
        })),
      );
    }
  });

  revalidatePath("/creator/availability");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Availability Windows
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stripe Connect
// ---------------------------------------------------------------------------

export async function startStripeOnboarding(country: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!country || !STRIPE_EXPRESS_COUNTRY_CODES.includes(country)) {
    return { error: "Invalid country" };
  }

  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));
  if (!profile) return { error: "Create a profile first" };

  // Create Express account if not already created.
  // NOTE: Uses Stripe v1 Accounts API (stripe.accounts.create with type:"express").
  // v2 accounts (stripe.v2.core.accounts.create) don't yet support hosted onboarding
  // via accountLinks.create(). When v2 Express matures, migrate to v2 API.
  let stripeAccountId = profile.stripe_account_id;
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country,
      email: user.email ?? undefined,
      capabilities: {
        transfers: { requested: true },
        // US requires card_payments to be requested alongside transfers
        // (Stripe rejects `transfers` alone for US accounts).
        ...(country === "US" ? { card_payments: { requested: true } } : {}),
      },
    });
    stripeAccountId = account.id;
    await db
      .update(creatorProfiles)
      .set({ stripe_account_id: stripeAccountId })
      .where(eq(creatorProfiles.id, profile.id));
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${origin}/creator?onboarding=refresh`,
    return_url: `${origin}/creator?onboarding=return`,
    type: "account_onboarding",
  });

  return { url: accountLink.url };
}

export async function checkOnboardingStatus(): Promise<{
  payouts_enabled: boolean;
  charges_enabled: boolean;
  stripe_onboarding_complete: boolean;
  identity_verified: boolean;
  currently_due: string[];
  eventually_due: string[];
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));
  if (!profile) {
    return {
      payouts_enabled: false,
      charges_enabled: false,
      stripe_onboarding_complete: false,
      identity_verified: false,
      currently_due: [],
      eventually_due: [],
    };
  }

  // Reconcile both phases against Stripe directly. Express account.updated
  // delivery has proven unreliable, so the direct retrieve is the source of
  // truth for both flags.
  const result = await reconcileCreatorOnboarding(profile.id);
  if (result.connect) {
    revalidatePath("/creator");
  }

  return {
    payouts_enabled: result.connect?.payouts_enabled ?? false,
    charges_enabled: result.connect?.charges_enabled ?? false,
    stripe_onboarding_complete: result.stripeOnboardingComplete,
    identity_verified: result.identityVerified,
    currently_due: result.connect?.requirements?.currently_due ?? [],
    eventually_due: result.connect?.requirements?.eventually_due ?? [],
  };
}

// ---------------------------------------------------------------------------
// Identity verification (second phase of Connect onboarding)
// ---------------------------------------------------------------------------

export async function startIdentityVerification() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));
  if (!profile) return { error: "Create a profile first" };
  if (!profile.stripe_account_id) {
    return { error: "Connect Stripe first" };
  }
  if (!profile.stripe_onboarding_complete) {
    return { error: "Complete Stripe onboarding first" };
  }

  // This is the identity phase of Connect onboarding, NOT the separate Stripe
  // Identity product. Express accounts only accept `account_onboarding` links
  // (`account_update` is rejected for Stripe-hosted onboarding accounts). Since
  // business/bank is already done, this link resumes at the remaining
  // identity-verification step, so the creator still does one more visit.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const accountLink = await stripe.accountLinks.create({
    account: profile.stripe_account_id,
    refresh_url: `${origin}/creator?onboarding=refresh`,
    return_url: `${origin}/creator?onboarding=return`,
    type: "account_onboarding",
  });

  return { url: accountLink.url };
}

// ---------------------------------------------------------------------------
// Publish gate
// ---------------------------------------------------------------------------

export async function setPublishedStatus(shouldPublish: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));
  if (!profile) return { error: "Create a profile first" };

  if (shouldPublish) {
    if (!profile.stripe_onboarding_complete) {
      return { error: "Complete Stripe onboarding before going live" };
    }
    if (!profile.identity_verified) {
      return { error: "Complete identity verification before going live" };
    }

    const [activeOfferingCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(offerings)
      .where(
        and(
          eq(offerings.creator_id, profile.id),
          eq(offerings.is_active, true),
          isNull(offerings.deleted_at),
        ),
      );
    if (Number(activeOfferingCount?.count ?? 0) === 0) {
      return { error: "Create at least one active offering before going live" };
    }

    const [availabilityCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(availabilityWindows)
      .where(eq(availabilityWindows.creator_id, profile.id));
    if (Number(availabilityCount?.count ?? 0) === 0) {
      return { error: "Set at least one availability window before going live" };
    }
  }

  await db
    .update(creatorProfiles)
    .set({ is_published: shouldPublish })
    .where(eq(creatorProfiles.id, profile.id));

  revalidatePath("/creator");
  revalidatePath("/creator/profile");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Banner removal
// ---------------------------------------------------------------------------

export async function removeBanner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));
  if (!profile) return { error: "Create a profile first" };

  // Delete the file from storage (deterministic path — no orphan)
  const storagePath = `banners/${profile.id}`;
  try {
    const serviceSupabase = await createServiceClient();
    await serviceSupabase.storage.from("haibu-media").remove([storagePath]);
  } catch {
    // Storage cleanup failure is non-fatal — the DB null is what matters.
  }

  await db
    .update(creatorProfiles)
    .set({ banner_url: null })
    .where(eq(creatorProfiles.id, profile.id));

  revalidatePath("/creator/profile");
  return { success: true };
}
