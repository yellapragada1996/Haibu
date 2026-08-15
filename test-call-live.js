// Real two-participant Daily call test harness.
// Prereqs: real DAILY_API_KEY + DAILY_WEBHOOK_SECRET in .env.local, localtunnel up,
// Daily dashboard webhook for haibu.daily.co pointed at the tunnel URL.

const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");

const BASE = "http://localhost:3000";
const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";
const BOOKING_ID = "fa7ecebb-969f-4df9-9e22-a7e309a1ba71";
const ROOM_NAME = "booking-calltest";
const FAN_ID = "0d719919-6565-4063-8de2-772f63e25125";
const CREATOR_USER_ID = "f0660cc5-f7b2-439b-a61a-83bdbfd0a071";
const DB = "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!env.DAILY_API_KEY || env.DAILY_API_KEY.includes("placeholder")) {
    console.error("BLOCKED: DAILY_API_KEY is still a placeholder in .env.local");
    process.exit(2);
  }
  if (!env.DAILY_WEBHOOK_SECRET || env.DAILY_WEBHOOK_SECRET.includes("placeholder")) {
    console.error("BLOCKED: DAILY_WEBHOOK_SECRET is still a placeholder in .env.local");
    process.exit(2);
  }

  const db = new Client({ connectionString: DB });
  await db.connect();

  // ---- Step 1: shift booking into the live join window (explicit test-DB manipulation)
  const start = new Date(Date.now() + 2 * 60000);
  const end = new Date(Date.now() + 10 * 60000);
  await db.query(
    `UPDATE bookings SET start_at = $2, end_at = $3, fan_joined_at = NULL, creator_joined_at = NULL WHERE id = $1`,
    [BOOKING_ID, start.toISOString(), end.toISOString()],
  );
  console.log(`BOOKING SHIFTED: start=${start.toISOString()} end=${end.toISOString()}`);

  // ---- Step 1b: confirm room exists on Daily (real API), backfill real URL
  let roomUrl = null;
  const roomRes = await fetch(`https://api.daily.co/v1/rooms/${ROOM_NAME}`, {
    headers: { Authorization: `Bearer ${env.DAILY_API_KEY}` },
  });
  if (!roomRes.ok) {
    const createRes = await fetch(`https://api.daily.co/v1/rooms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.DAILY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: ROOM_NAME, privacy: "private" }),
    });
    if (!createRes.ok) {
      console.error("Could not create Daily room:", await createRes.text());
      process.exit(1);
    }
    const created = await createRes.json();
    roomUrl = created.url;
    console.log("ROOM CREATED:", ROOM_NAME, "url:", roomUrl);
  } else {
    const existing = await roomRes.json();
    roomUrl = existing.url;
    console.log("ROOM EXISTS:", ROOM_NAME, "url:", roomUrl);
  }
  if (roomUrl) {
    await db.query(`UPDATE bookings SET daily_room_url = $2 WHERE id = $1`, [BOOKING_ID, roomUrl]);
    console.log("daily_room_url backfilled:", roomUrl);
  }

  // ---- Step 2: two browser contexts, fan + creator
  const browser = await chromium.launch();
  const login = async (ctx, email) => {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', "haibu123");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    return page;
  };

  const fanCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const creatorCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const fanPage = await login(fanCtx, "fan@haibu.test");
  const creatorPage = await login(creatorCtx, "creator@haibu.test");

  const callUrl = `${BASE}/bookings/${BOOKING_ID}/call`;
  console.log("NAVIGATING both participants to", callUrl);
  await Promise.all([
    fanPage.goto(callUrl, { waitUntil: "domcontentloaded" }),
    creatorPage.goto(callUrl, { waitUntil: "domcontentloaded" }),
  ]);

  // Both pages should reach in_call (the iframe container becomes visible)
  const fanInCall = await fanPage.waitForSelector("div.h-screen.w-full", { state: "visible", timeout: 30000 })
    .then(() => true).catch(() => false);
  const creatorInCall = await creatorPage.waitForSelector("div.h-screen.w-full", { state: "visible", timeout: 30000 })
    .then(() => true).catch(() => false);
  console.log(`IN_CALL: fan=${fanInCall} creator=${creatorInCall}`);
  if (!fanInCall) console.log("fan page body:", (await fanPage.locator("body").innerText()).slice(0, 300));
  if (!creatorInCall) console.log("creator page body:", (await creatorPage.locator("body").innerText()).slice(0, 300));

  await fanPage.screenshot({ path: `${SHOT}/call-fan.png` });
  await creatorPage.screenshot({ path: `${SHOT}/call-creator.png` });

  // ---- Step 3: Daily REST presence — the definitive two-party proof
  await sleep(5000);
  const presenceRes = await fetch(`https://api.daily.co/v1/rooms/${ROOM_NAME}/presence`, {
    headers: { Authorization: `Bearer ${env.DAILY_API_KEY}` },
  });
  const presence = await presenceRes.json();
  const participants = presence.data ?? [];
  console.log("DAILY PRESENCE:", JSON.stringify(participants.map((p) => ({ id: p.id, user_id: p.user_id, user_name: p.user_name })), null, 1));
  const hasFan = participants.some((p) => p.user_id === `fan:${FAN_ID}`);
  const hasCreator = participants.some((p) => p.user_id === `creator:${CREATOR_USER_ID}`);
  console.log(`PRESENCE CHECK: fan=${hasFan} creator=${hasCreator} total=${participants.length}`);

  // ---- Step 4: real webhook stamps in the DB
  await sleep(3000);
  const row = await db.query(
    `SELECT fan_joined_at, creator_joined_at, status FROM bookings WHERE id = $1`,
    [BOOKING_ID],
  );
  console.log("BOOKING ROW AFTER JOINS:", JSON.stringify(row.rows[0]));

  // ---- Step 5: third-party gating while live
  const { createClient } = require("@supabase/supabase-js");
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const strangerEmail = `stranger${Date.now()}@haibu.test`;
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: strangerEmail,
    password: "stranger123",
    email_confirm: true,
  });
  if (createErr) {
    console.error("THIRD-ACCOUNT CREATE FAILED:", createErr.message);
  } else {
    console.log("THIRD ACCOUNT:", strangerEmail);
    const strangerCtx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const strangerPage = await strangerCtx.newPage();
    await strangerPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await strangerPage.fill('input[type="email"]', strangerEmail);
    await strangerPage.fill('input[type="password"]', "stranger123");
    await strangerPage.click('button[type="submit"]');
    await strangerPage.waitForTimeout(2500);
    const gate = await strangerPage.evaluate(async (id) => {
      const r = await fetch(`/api/meetings/token?bookingId=${id}`);
      return { status: r.status, body: await r.text() };
    }, BOOKING_ID);
    console.log("GATING RESPONSE:", JSON.stringify(gate));
    await strangerCtx.close();
  }

  await browser.close();
  await db.end();
  console.log("DONE");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
