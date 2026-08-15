const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");

(async () => {
  const db = new Client({ connectionString: "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres" });
  await db.connect();
  const BOOKING = crypto.randomUUID();
  const s1 = new Date(Date.now() + 10 * 60000), e1 = new Date(Date.now() + 40 * 60000);
  await db.query(
    `INSERT INTO bookings (id, creator_id, fan_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, daily_room_name, daily_room_url) VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, 2500, 450, 2050, 'booking-evaltest', 'https://haibu.daily.co/booking-evaltest')`,
    [BOOKING, "073c016e-db44-460f-9c32-824ec9c7d367", "0d719919-6565-4063-8de2-772f63e25125", "8c1410e0-eddb-423d-86c8-c409a9f4ed87", s1.toISOString(), e1.toISOString()],
  );

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "fan@haibu.test");
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:3000/bookings/${BOOKING}/call`);
  await page.waitForSelector("text=Session hasn't started yet", { timeout: 10000 });
  await page.screenshot({ path: "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots/call-retrofit-too-early.png" });
  console.log("too-early state captured");

  const s2 = new Date(Date.now() - 2 * 60000), e2 = new Date(Date.now() + 20 * 60000);
  await db.query(`UPDATE bookings SET start_at = $2, end_at = $3 WHERE id = $1`, [BOOKING, s2.toISOString(), e2.toISOString()]);
  await page.goto(`http://localhost:3000/bookings/${BOOKING}/call`);
  await page.waitForSelector("div.flex-1.min-h-0", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log("HEADER:", JSON.stringify(await page.locator("header").innerText()));
  await page.waitForTimeout(3000);
  console.log("HEADER (3s later):", JSON.stringify(await page.locator("header").innerText()));
  await page.screenshot({ path: "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots/call-retrofit-live.png" });

  await page.click('button:has-text("Leave")');
  await page.waitForSelector("text=Session ended", { timeout: 10000 });
  await page.screenshot({ path: "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots/call-retrofit-ended.png" });
  console.log("leave → ended verified");

  await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
  await db.end();
  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
