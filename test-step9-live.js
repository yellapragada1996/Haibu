// Step 9 re-verification with REAL call/webhook data (post signature-fix).
// Test A: real two-party join stamps → completed.
// Test B1: real creator-only join (real webhook stamp) → no_show_fan.
// Test B2/B3: stamp-absence cases via explicit test-DB manipulation.

const { chromium } = require("playwright");
const { Client } = require("pg");

const BASE = "http://localhost:3000";
const DB = "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const DAILY_KEY = "e80781ee30a4f67976f30970b1de6db4727280fdda588cffa8d93d596818d9e3";
const BOOKING_A = "fa7ecebb-969f-4df9-9e22-a7e309a1ba71"; // real both-joined
const BOOKING_B1 = "7ddda204-f407-42d5-aa4f-a95b9fd1b863"; // real creator-only join
const BOOKING_B2 = "5e99825a-e510-4011-a709-2f24569ede62"; // manipulated fan-only
const CREATOR_PROFILE = "073c016e-db44-460f-9c32-824ec9c7d367";
const FAN_ID = "0d719919-6565-4063-8de2-772f63e25125";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = new Client({ connectionString: DB });
  await db.connect();

  const evalBooking = async (id) => {
    const res = await fetch(`${BASE}/api/dev/run-evaluation?bookingId=${id}`);
    return res.json();
  };

  const before = await db.query(
    `SELECT id, status, fan_joined_at, creator_joined_at FROM bookings WHERE id IN ($1,$2,$3) ORDER BY id`,
    [BOOKING_A, BOOKING_B1, BOOKING_B2],
  );
  console.log("=== BEFORE ===");
  before.rows.forEach((r) => console.log(JSON.stringify(r)));

  // ---- TEST A: both genuinely joined (real stamps from live session) ----
  await db.query(
    `UPDATE bookings SET status = 'confirmed', start_at = NOW() - INTERVAL '25 minutes', end_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`,
    [BOOKING_A],
  );
  const resultA = await evalBooking(BOOKING_A);
  console.log("=== TEST A (both joined → completed) ===");
  console.log(JSON.stringify(resultA));
  const aOk = resultA.booking?.status === "completed" && resultA.booking?.payout_eligible_at !== null;

  // ---- TEST B1: REAL creator-only join → no_show_fan ----
  // Create a dedicated room + shift booking into the window
  const roomRes = await fetch(`https://api.daily.co/v1/rooms/booking-evaltest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DAILY_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "booking-evaltest", privacy: "private", properties: { enable_prejoin_ui: false } }),
  });
  let room = roomRes.ok ? await roomRes.json() : null;
  if (!room) {
    const getRes = await fetch(`https://api.daily.co/v1/rooms/booking-evaltest`, {
      headers: { Authorization: `Bearer ${DAILY_KEY}` },
    });
    room = getRes.ok ? await getRes.json() : null;
  }
  if (!room) {
    console.error("B1: could not create/get room", await roomRes.text());
    process.exit(1);
  }
  const start = new Date(Date.now() + 2 * 60000);
  const end = new Date(Date.now() + 8 * 60000);
  await db.query(
    `UPDATE bookings SET status = 'confirmed', start_at = $2, end_at = $3, daily_room_name = $4, daily_room_url = $5, fan_joined_at = NULL, creator_joined_at = NULL WHERE id = $1`,
    [BOOKING_B1, start.toISOString(), end.toISOString(), "booking-evaltest", room.url],
  );

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "creator@haibu.test");
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/bookings/${BOOKING_B1}/call`);
  const inCall = await page.waitForSelector("div.h-screen.w-full", { state: "visible", timeout: 25000 }).then(() => true).catch(() => false);
  console.log(`B1 creator in call: ${inCall}`);
  await sleep(12000); // let the real webhook deliver + stamp
  await browser.close();

  const b1Mid = await db.query(
    `SELECT fan_joined_at, creator_joined_at FROM bookings WHERE id = $1`,
    [BOOKING_B1],
  );
  console.log("=== TEST B1 (real creator-only join) stamps ===");
  console.log(JSON.stringify(b1Mid.rows[0]));
  await db.query(
    `UPDATE bookings SET status = 'confirmed', start_at = NOW() - INTERVAL '25 minutes', end_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`,
    [BOOKING_B1],
  );
  const resultB1 = await evalBooking(BOOKING_B1);
  console.log(JSON.stringify(resultB1));
  const b1Ok =
    b1Mid.rows[0].creator_joined_at !== null &&
    b1Mid.rows[0].fan_joined_at === null &&
    resultB1.booking?.status === "no_show_fan";

  // ---- TEST B2: fan-only stamp → no_show_creator (manipulated; PI nulled to avoid fake-PI Stripe call) ----
  await db.query(
    `UPDATE bookings SET status = 'confirmed', end_at = NOW() - INTERVAL '10 minutes', fan_joined_at = NOW(), creator_joined_at = NULL, stripe_payment_intent_id = NULL WHERE id = $1`,
    [BOOKING_B2],
  );
  const resultB2 = await evalBooking(BOOKING_B2);
  console.log("=== TEST B2 (fan only → no_show_creator) ===");
  console.log(JSON.stringify(resultB2));
  const b2Ok =
    resultB2.booking?.status === "no_show_creator" &&
    resultB2.booking?.cancelled_by === "system" &&
    resultB2.booking?.cancel_reason === "creator did not join";

  // ---- TEST B3: neither joined → cancelled_creator (fresh fixture) ----
  const b3Id = require("crypto").randomUUID();
  await db.query(
    `INSERT INTO bookings (id, creator_id, fan_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, fan_joined_at, creator_joined_at) VALUES ($1, $2, $3, $4, 'confirmed', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '10 minutes', 2000, 360, 1640, NULL, NULL)`,
    [b3Id, CREATOR_PROFILE, FAN_ID, "8c1410e0-eddb-423d-86c8-c409a9f4ed87"],
  );
  const resultB3 = await evalBooking(b3Id);
  console.log("=== TEST B3 (neither joined → cancelled_creator) ===");
  console.log(JSON.stringify(resultB3));
  const b3Ok =
    resultB3.booking?.status === "cancelled_creator" &&
    resultB3.booking?.cancelled_by === "system" &&
    resultB3.booking?.cancel_reason === "neither party joined";
  await db.query(`DELETE FROM bookings WHERE id = $1`, [b3Id]);

  await db.end();
  console.log("=== RESULTS ===");
  console.log(`A  completed (both real joins): ${aOk ? "PASS" : "FAIL"}`);
  console.log(`B1 no_show_fan (real creator-only join, no fan stamp): ${b1Ok ? "PASS" : "FAIL"}`);
  console.log(`B2 no_show_creator (fan-only stamp): ${b2Ok ? "PASS" : "FAIL"}`);
  console.log(`B3 cancelled_creator (no stamps): ${b3Ok ? "PASS" : "FAIL"}`);
  process.exit(aOk && b1Ok && b2Ok && b3Ok ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
