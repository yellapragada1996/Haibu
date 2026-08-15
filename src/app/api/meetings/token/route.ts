import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { bookings, creatorProfiles, users, offerings } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createMeetingToken } from "@/lib/daily";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bookingId = request.nextUrl.searchParams.get("bookingId");
  if (!bookingId) {
    return NextResponse.json({ error: "missing bookingId" }, { status: 400 });
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      fan_id: bookings.fan_id,
      creator_user_id: creatorProfiles.user_id,
      status: bookings.status,
      start_at: bookings.start_at,
      end_at: bookings.end_at,
      daily_room_name: bookings.daily_room_name,
      daily_room_url: bookings.daily_room_url,
      offering_title: offerings.title,
    })
    .from(bookings)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookings.creator_id))
    .innerJoin(offerings, eq(offerings.id, bookings.offering_id))
    .where(eq(bookings.id, bookingId));

  if (!booking) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Gate 1: requester must be the fan or the creator
  const isFan = user.id === booking.fan_id;
  const isCreator = user.id === booking.creator_user_id;
  if (!isFan && !isCreator) {
    return NextResponse.json({ error: "not your session" }, { status: 403 });
  }

  // Gate 2: booking must be confirmed
  if (booking.status !== "confirmed") {
    return NextResponse.json({ error: "session not confirmed" }, { status: 403 });
  }

  // Gate 3: must be within join window (start - 5min to end + 5min)
  if (!booking.start_at || !booking.end_at) {
    return NextResponse.json({ error: "session not scheduled" }, { status: 403 });
  }

  const now = Date.now();
  const joinStart = new Date(booking.start_at).getTime() - 5 * 60 * 1000;
  const joinEnd = new Date(booking.end_at).getTime() + 5 * 60 * 1000;

  if (now < joinStart) {
    return NextResponse.json({
      error: "too early",
      join_start_at: new Date(joinStart).toISOString(),
    }, { status: 403 });
  }
  if (now > joinEnd) {
    return NextResponse.json({ error: "too late" }, { status: 403 });
  }

  // The Daily room is created asynchronously after confirmation (Inngest
  // job) — locally that job never runs, so a confirmed booking may not have
  // a room yet. Fail cleanly instead of throwing a 500 that the client
  // would misread as a malformed frame config.
  if (!booking.daily_room_name || !booking.daily_room_url) {
    return NextResponse.json(
      { error: "room not ready" },
      { status: 409 },
    );
  }

  // Load display name for this user
  const [profile] = await db
    .select({ display_name: users.display_name, avatar_url: users.avatar_url })
    .from(users)
    .where(eq(users.id, user.id));

  const role = isFan ? "fan" : "creator";
  const token = await createMeetingToken({
    roomName: booking.daily_room_name,
    userId: `${role}:${user.id}`,
    userName: profile?.display_name ?? user.email ?? "User",
    expUnix: Math.floor(joinEnd / 1000),
  });

  return NextResponse.json({
    token: token.token,
    room_url: booking.daily_room_url,
    role,
    session_title: booking.offering_title,
    session_end_at: booking.end_at?.toISOString() ?? null,
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
  });
}
