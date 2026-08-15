// Auto-publish (double-blind delay) end-to-end. Requires the Inngest dev
// server and REVIEW_PUBLISH_DELAY_MS=60000 in .env.local.

const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const crypto = require("crypto");

const BASE = "http://localhost:3000";
const FAN_ID = "0d719919-6565-4063-8de2-772f63e25125";
const CREATOR_PROFILE_ID = "073c016e-db44-460f-9c32-824ec9c7d367";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
console.log("REVIEW_PUBLISH_DELAY_MS =", env.REVIEW_PUBLISH_DELAY_MS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

async function main() {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();

  const offeringId = crypto.randomUUID();
  await db.query(
    `INSERT INTO offerings (id, creator_id, title, category, duration_minutes, price_cents, is_active) VALUES ($1,$2,'Review Test Auto','music',30,2500,true)`,
    [offeringId, CREATOR_PROFILE_ID],
  );
  const bookingId = crypto.randomUUID();
  const start = new Date(Date.now() - 1 * 86400000);
  const end = new Date(start.getTime() + 30 * 60000);
  const joined = new Date(start.getTime() + 2 * 60000);
  await db.query(
    `INSERT INTO bookings (id, fan_id, creator_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, fan_joined_at, creator_joined_at, payout_eligible_at)
     VALUES ($1,$2,$3,$4,'completed',$5,$6,2500,450,2050,$7,$7,$8)`,
    [bookingId, FAN_ID, CREATOR_PROFILE_ID, offeringId, start.toISOString(), end.toISOString(), joined.toISOString(), new Date(start.getTime() + 72 * 3600000).toISOString()],
  );

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const fan = await ctx.newPage();
    await login(fan, "fan@haibu.test");
    await fan.goto(`${BASE}/bookings/${bookingId}`, { waitUntil: "networkidle" });
    await fan.getByRole("button", { name: "5 stars" }).click();
    await fan.getByRole("button", { name: "Submit review" }).click();
    await sleep(1500);

    let r = await db.query(`SELECT is_public, published_at FROM reviews WHERE booking_id = $1 AND reviewer_role='guest'`, [bookingId]);
    console.log("[after submit] is_public:", r.rows[0]?.is_public, "| published_at:", r.rows[0]?.published_at);
    if (r.rows[0]?.is_public !== false) throw new Error("Review should be held right after submit");

    console.log("waiting 65s for the delayed publish to fire…");
    await sleep(65000);

    r = await db.query(`SELECT is_public, published_at FROM reviews WHERE booking_id = $1 AND reviewer_role='guest'`, [bookingId]);
    console.log("[after delay] is_public:", r.rows[0]?.is_public, "| published_at:", r.rows[0]?.published_at);
    if (r.rows[0]?.is_public !== true) throw new Error("Auto-publish did not fire after the delay");

    await ctx.close();
    console.log("AUTO-PUBLISH PASSED");
  } finally {
    await db.query("DELETE FROM reviews WHERE booking_id = $1", [bookingId]);
    await db.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
    await db.query("DELETE FROM offerings WHERE id = $1", [offeringId]);
    await db.end();
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
