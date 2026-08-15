const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const crypto = require("crypto");
const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const BASE = "http://localhost:3000";
const FAN_ID = "0d719919-6565-4063-8de2-772f63e25125";
const CREATOR_PROFILE_ID = "073c016e-db44-460f-9c32-824ec9c7d367";
const OFFERING_ID = "8c1410e0-eddb-423d-86c8-c409a9f4ed87";
(async () => {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  const bookingId = crypto.randomUUID();
  const start = new Date(Date.now() - 2 * 86400000);
  const end = new Date(start.getTime() + 30 * 60000);
  await db.query(`INSERT INTO bookings (id, fan_id, creator_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents) VALUES ($1,$2,$3,$4,'completed',$5,$6,4000,720,3280)`, [bookingId, FAN_ID, CREATOR_PROFILE_ID, OFFERING_ID, start.toISOString(), end.toISOString()]);
  await db.query(`INSERT INTO reviews (booking_id, creator_id, rating, text) VALUES ($1,$2,5,'Lovely session, very relaxing.')`, [bookingId, CREATOR_PROFILE_ID]);
  console.log("inserted booking", bookingId);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "fan@haibu.test");
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/creators/${CREATOR_PROFILE_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => document.body.innerText);
  console.log("=== BODY TEXT ===");
  console.log(text);
  await page.screenshot({ path: "/tmp/debug-profile.png", fullPage: true });
  await db.query("DELETE FROM reviews WHERE booking_id = $1", [bookingId]);
  await db.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
  await db.end();
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
