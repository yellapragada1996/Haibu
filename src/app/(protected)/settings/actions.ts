"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function updateDisplayName(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName = (formData.get("display_name") as string)?.trim();
  if (!displayName || displayName.length < 2) {
    return { error: "Display name must be at least 2 characters" };
  }
  if (displayName.length > 50) {
    return { error: "Display name must be under 50 characters" };
  }

  await db.update(users).set({ display_name: displayName }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { success: true };
}
