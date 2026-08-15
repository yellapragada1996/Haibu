// Creates a confirmed test booking for a quick manual video-call test.
// Run right before testing: start_at is always NOW + 10 minutes.
// Usage: node create-manual-test-booking.js

const { Client } = require("pg");
const fs = require("fs");
const crypto = require("crypto");

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const DAILY_KEY = env.DAILY_API_KEY;
const DB_URL = env.DATABASE_URL;
const ROOM_NAME = "booking-manual-test";

// Fan + creator from the standard test accounts
const FAN_ID = "0d719919-6565-4063-8de2-772f63e25125"; // fan@haibu.test
const CREATOR_PROFILE_ID = "073c016e-db44-460f-9c32-824ec9c7d367"; // creator@haibu.test (Queen)
const OFFERING_ID = "8c1410e0-eddb-423d-86c8-c409a9f4ed87"; // Piano Lessons (30 min)

async function ensureRoom() {
  const createRes = await fetch(`https://api.daily.co/v1/rooms`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DAILY_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: ROOM_NAME,
      privacy: "private",
      properties: {
        enable_prejoin_ui: false,
        start_audio_off: true,
        start_video_off: true,
        enable_chat: true,
        enable_recording: false,
      },
    }),
  });
  if (createRes.ok) return createRes.json();
  const getRes = await fetch(`https://api.daily.co/v1/rooms/${ROOM_NAME}`, {
    headers: { Authorization: `Bearer ${DAILY_KEY}` },
  });
  if (!getRes.ok) throw new Error(`Room ensure failed: ${await getRes.text()}`);
  return getRes.json();
}

async function main() {
  const room = await ensureRoom();
  console.log(`Room ready: ${room.name} (${room.url})`);

  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  // Joinable IMMEDIATELY: start 1 minute from now puts the join window
  // (start - 5min) in the past at creation time — no waiting.
  const start = new Date(Date.now() + 1 * 60000);
  const end = new Date(start.getTime() + 30 * 60000);
  const bookingId = crypto.randomUUID();

  await db.query(
    `INSERT INTO bookings (id, fan_id, creator_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, daily_room_name, daily_room_url)
     VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, 2500, 450, 2050, $7, $8)`,
    [bookingId, FAN_ID, CREATOR_PROFILE_ID, OFFERING_ID, start.toISOString(), end.toISOString(), room.name, room.url],
  );
  await db.end();

  console.log("");
  console.log("Booking created:");
  console.log(`  id:        ${bookingId}`);
  console.log(`  start_at:  ${start.toISOString()}  (1 min from now)`);
  console.log(`  end_at:    ${end.toISOString()}  (30 min session)`);
  console.log(`  join window: OPEN NOW`);
  console.log("");
  console.log("Navigate to (either account can join):");
  console.log(`  booking page: http://localhost:3000/bookings/${bookingId}`);
  console.log(`  call page:    http://localhost:3000/bookings/${bookingId}/call`);
  console.log("");
  console.log("Accounts: fan@haibu.test / creator@haibu.test, password haibu123");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
