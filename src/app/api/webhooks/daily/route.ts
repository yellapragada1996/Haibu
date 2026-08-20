import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, participantEvents } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { isPgErrorCode } from "@/lib/pg-errors";
import crypto from "crypto";

function verifyDailySignature(body: string, sig: string | null, ts: string | null) {
  if (!sig || !ts) return false;
  const secretB64 = process.env.DAILY_WEBHOOK_SECRET;
  if (!secretB64) return false;
  // Daily: x-webhook-signature = base64(HMAC-SHA256(decoded_secret, `${ts}.${body}`))
  let key: Buffer;
  try {
    key = Buffer.from(secretB64, "base64");
  } catch {
    return false;
  }
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(`${ts}.${body}`);
  return sig === hmac.digest("base64");
}

export async function POST(request: Request) {
  const sig = request.headers.get("x-webhook-signature");
  const ts = request.headers.get("x-webhook-timestamp");
  const rawBody = await request.text();

  // Daily's webhook-creation verification ping is unsigned; only accept it
  // during the explicit bootstrap window (DAILY_WEBHOOK_BOOTSTRAP=1).
  if (process.env.DAILY_WEBHOOK_BOOTSTRAP === "1") {
    return NextResponse.json({ received: true });
  }

  if (!verifyDailySignature(rawBody, sig, ts)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type: string; event_ts?: number; payload: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only presence events are relevant to the session model.
  if (event.type !== "participant.joined" && event.type !== "participant.left") {
    return NextResponse.json({ received: true });
  }

  const payload = event.payload as {
    room?: string;
    user_id?: string;
    session_id?: string;
    joined_at?: number;
    duration?: number;
  };
  const roomName = payload.room;
  const userId = payload.user_id;
  const sessionId = payload.session_id;

  if (!roomName || !userId) {
    return NextResponse.json({ received: true });
  }

  // Parse "fan:<uuid>" or "creator:<uuid>"
  const [role] = userId.split(":");
  if (role !== "fan" && role !== "creator") {
    return NextResponse.json({ received: true });
  }

  // Event time (payload.joined_at is unix seconds), not processing time.
  const joinedAt =
    typeof payload.joined_at === "number"
      ? new Date(payload.joined_at * 1000)
      : new Date();
  const eventTs =
    typeof event.event_ts === "number"
      ? new Date(event.event_ts * 1000)
      : null;

  // Log to the presence table (Phase 4). Idempotent via unique
  // (session_id, event_type) — a duplicate delivery is ignored.
  if (sessionId) {
    try {
      await db.insert(participantEvents).values({
        room_name: roomName,
        user_id: userId,
        session_id: sessionId,
        event_type: event.type === "participant.joined" ? "joined" : "left",
        joined_at: joinedAt,
        duration_seconds:
          typeof payload.duration === "number" ? payload.duration : null,
        event_ts: eventTs,
      });
    } catch (e: unknown) {
      // 23505 = duplicate (session_id, event_type) — genuine idempotency.
      if (!isPgErrorCode(e, "23505")) throw e;
    }
  }

  // Keep stamping first-join for the binary no-show evaluation (which still
  // reads fan_joined_at / creator_joined_at). IS NULL guard → first join only.
  if (event.type === "participant.joined") {
    if (role === "fan") {
      await db
        .update(bookings)
        .set({ fan_joined_at: joinedAt })
        .where(
          and(
            eq(bookings.daily_room_name, roomName),
            isNull(bookings.fan_joined_at),
          ),
        );
    } else {
      await db
        .update(bookings)
        .set({ creator_joined_at: joinedAt })
        .where(
          and(
            eq(bookings.daily_room_name, roomName),
            isNull(bookings.creator_joined_at),
          ),
        );
    }
  }

  return NextResponse.json({ received: true });
}
