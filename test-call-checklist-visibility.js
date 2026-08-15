// Standing visibility check for the call screen (runs alongside
// test-call-checklist.js before any "done" claim).
//
// Asserts the control tray is FULLY visible within the viewport at a range of
// real browser window sizes (the automated functional checklist runs at one
// fixed size and cannot catch viewport-clipping regressions).
//
// Usage:
//   node test-call-checklist-visibility.js            # headless sweep
//   node test-call-checklist-visibility.js --headed   # + human confirmation

const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");

const DB = "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";
const HEADED = process.argv.includes("--headed");

// Real-world window sizes incl. laptop with browser chrome
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1440, h: 780 },
  { w: 1366, h: 768 },
  { w: 1280, h: 720 },
  { w: 1100, h: 700 },
];

(async () => {
  const db = new Client({ connectionString: DB });
  await db.connect();
  const BOOKING = crypto.randomUUID();
  const s = new Date(Date.now() - 2 * 60000), e = new Date(Date.now() + 20 * 60000);
  await db.query(
    `INSERT INTO bookings (id, creator_id, fan_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, daily_room_name, daily_room_url) VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, 2500, 450, 2050, 'booking-evaltest', 'https://haibu.daily.co/booking-evaltest')`,
    [BOOKING, "073c016e-db44-460f-9c32-824ec9c7d367", "0d719919-6565-4063-8de2-772f63e25125", "8c1410e0-eddb-423d-86c8-c409a9f4ed87", s.toISOString(), e.toISOString()],
  );

  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "fan@haibu.test");
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`http://localhost:3000/bookings/${BOOKING}/call`);
  await page.waitForSelector("div.relative.flex-1.min-h-0", { state: "visible", timeout: 30000 });

  let allPass = true;
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await new Promise((r) => setTimeout(r, 2500));
    const frame = page.frames().find((f) => f.url().includes("daily.co"));
    const tray = await frame.locator(".tray").boundingBox().catch(() => null);
    if (!tray) { console.log(`${vp.w}x${vp.h}: TRAY MISSING — FAIL`); allPass = false; continue; }
    // frame.locator().boundingBox() is already in page-space coordinates
    const top = tray.y;
    const bottom = top + tray.height;
    const fullyVisible = top >= 0 && bottom <= vp.h && tray.x >= 0 && tray.x + tray.width <= vp.w;
    console.log(
      `${vp.w}x${vp.h}: tray page-y ${Math.round(top)}..${Math.round(bottom)} of viewport ${vp.h} → ${fullyVisible ? "PASS" : "FAIL (clipped)"}`,
    );
    if (!fullyVisible) allPass = false;
    await page.screenshot({ path: `${SHOT}/call-visibility-${vp.w}x${vp.h}.png` });
  }

  if (HEADED) {
    console.log("Headed run: windows left open for human confirmation — check the tray is fully visible and clickable at each size. Close to finish.");
    await new Promise((r) => setTimeout(r, 30000));
  }

  await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
  await db.end();
  await browser.close();
  console.log(allPass ? "VISIBILITY SWEEP: ALL PASS" : "VISIBILITY SWEEP: FAILURES");
  process.exit(allPass ? 0 : 1);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
