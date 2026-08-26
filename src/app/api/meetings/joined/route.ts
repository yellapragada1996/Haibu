import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { bookings, creatorProfiles } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const bookingId = body?.bookingId;
  if (typeof bookingId !== "string") {
    return NextResponse.json({ error: "missing bookingId" }, { status: 400 });
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      fan_id: bookings.fan_id,
      creator_user_id: creatorProfiles.user_id,
    })
    .from(bookings)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .where(eq(bookings.id, bookingId));

  if (!booking) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const isFan = user.id === booking.fan_id;
  const isCreator = user.id === booking.creator_user_id;
  if (!isFan && !isCreator) {
    return NextResponse.json({ error: "not your session" }, { status: 403 });
  }

  const now = new Date();
  if (isFan) {
    await db
      .update(bookings)
      .set({ fan_joined_at: now })
      .where(and(eq(bookings.id, bookingId), isNull(bookings.fan_joined_at)));
  } else {
    await db
      .update(bookings)
      .set({ creator_joined_at: now })
      .where(
        and(eq(bookings.id, bookingId), isNull(bookings.creator_joined_at)),
      );
  }

  return NextResponse.json({ ok: true });
}
