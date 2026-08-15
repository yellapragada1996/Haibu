const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");

(async () => {
  const db = new Client({ connectionString: "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres" });
  await db.connect();
  const BOOKING = crypto.randomUUID();
  const s1 = new Date(Date.now() + 20 * 60000), e1 = new Date(Date.now() + 50 * 60000);
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

  // ---- State 1: pre-window — muted/disabled Join + ticking countdown ----
  await page.goto(`http://localhost:3000/bookings/${BOOKING}`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Join session", { timeout: 10000 });
  const joinBtn = page.locator('button:has-text("Join session")');
  const disabled1 = await joinBtn.isDisabled();
  const cd1 = await page.locator("text=Join available in").innerText();
  await page.waitForTimeout(2500);
  const cd2 = await page.locator("text=Join available in").innerText();
  console.log(`PRE-WINDOW: disabled=${disabled1} | "${cd1}" → "${cd2}" (ticking=${cd1 !== cd2})`);
  await page.screenshot({ path: "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots/booking-retrofit-pre-window.png", fullPage: true });

  // ---- Cancel modal state ----
  await page.click('button:has-text("Cancel session")');
  await page.waitForSelector("text=Cancel session", { timeout: 5000 });
  await page.waitForTimeout(300);
  const modalText = await page.locator("text=This cannot be undone").count();
  const refundText = await page.locator("text=Full refund").count();
  console.log(`CANCEL MODAL: shown=${modalText > 0}, refund-line=${refundText > 0}`);
  await page.screenshot({ path: "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots/booking-retrofit-cancel-modal.png" });
  await page.click('button:has-text("Keep session")');

  // ---- State 2: window open — Join enabled ----
  const s2 = new Date(Date.now() - 2 * 60000), e2 = new Date(Date.now() + 28 * 60000);
  await db.query(`UPDATE bookings SET start_at = $2, end_at = $3 WHERE id = $1`, [BOOKING, s2.toISOString(), e2.toISOString()]);
  await page.goto(`http://localhost:3000/bookings/${BOOKING}`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Your session is live", { timeout: 10000 });
  const disabled2 = await page.locator('button:has-text("Join session")').isDisabled();
  console.log(`IN-WINDOW: disabled=${disabled2} (expect false)`);
  await page.screenshot({ path: "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots/booking-retrofit-open.png", fullPage: true });

  // ---- Join click navigates to call page ----
  await page.click('button:has-text("Join session")');
  await page.waitForURL("**/call", { timeout: 15000 });
  console.log("JOIN CLICK → call page ✓");

  await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
  await db.end();
  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
