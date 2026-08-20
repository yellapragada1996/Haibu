import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let timezone: string;
  try {
    const body = await request.json();
    timezone = body.timezone;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!timezone || typeof timezone !== "string") {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  try {
    // Re-sync on every capture — the browser timezone changes when a user
    // travels or updates their device settings, so do NOT gate on
    // timezone_confirmed (that froze the stored timezone at signup and left the
    // dashboard / booking pages rendering stale times).
    const result = await db
      .update(users)
      .set({ timezone, timezone_confirmed: true })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      timezone,
      updated: result.rowCount && result.rowCount > 0,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to update timezone" },
      { status: 500 },
    );
  }
}
