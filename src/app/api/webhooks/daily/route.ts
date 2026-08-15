import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
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

  let event: { type: string; payload: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.type !== "participant.joined") {
    return NextResponse.json({ received: true });
  }

  const payload = event.payload as {
    room?: string;
    user_id?: string;
  };
  const roomName = payload.room;
  const userId = payload.user_id;

  if (!roomName || !userId) {
    return NextResponse.json({ received: true });
  }

  // Parse "fan:<uuid>" or "creator:<uuid>"
  const [role] = userId.split(":");
  if (role !== "fan" && role !== "creator") {
    return NextResponse.json({ received: true });
  }

  // Stamp join time — IS NULL guard ensures only the first join is recorded.
  // Reconnects/refreshes after the initial join are no-ops.
  if (role === "fan") {
    await db
      .update(bookings)
      .set({ fan_joined_at: new Date() })
      .where(
        and(
          eq(bookings.daily_room_name, roomName),
          isNull(bookings.fan_joined_at),
        ),
      );
  } else {
    await db
      .update(bookings)
      .set({ creator_joined_at: new Date() })
      .where(
        and(
          eq(bookings.daily_room_name, roomName),
          isNull(bookings.creator_joined_at),
        ),
      );
  }

  return NextResponse.json({ received: true });
}
