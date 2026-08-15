// Final screenshots: full uncropped viewport, camera-off (avatar state) + camera-on.
const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");

const DB = "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";

async function makeBooking(db, roomName, roomUrl) {
  const id = crypto.randomUUID();
  const s = new Date(Date.now() - 2 * 60000), e = new Date(Date.now() + 20 * 60000);
  await db.query(
    `INSERT INTO bookings (id, creator_id, fan_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, daily_room_name, daily_room_url) VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, 2500, 450, 2050, $7, $8)`,
    [id, "073c016e-db44-460f-9c32-824ec9c7d367", "0d719919-6565-4063-8de2-772f63e25125", "8c1410e0-eddb-423d-86c8-c409a9f4ed87", s.toISOString(), e.toISOString(), roomName, roomUrl],
  );
  return id;
}

async function login(page, email) {
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

(async () => {
  const db = new Client({ connectionString: DB });
  await db.connect();

  // ---- Camera OFF: two windows on booking-evaltest (video off room) ----
  const b1 = await makeBooking(db, "booking-evaltest", "https://haibu.daily.co/booking-evaltest");
  const browser = await chromium.launch();
  const fanCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const fanPage = await fanCtx.newPage();
  await login(fanPage, "fan@haibu.test");
  await fanPage.goto(`http://localhost:3000/bookings/${b1}/call`);
  await fanPage.waitForSelector("div.relative.flex-1.min-h-0", { state: "visible", timeout: 30000 });

  const creatorCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const creatorPage = await creatorCtx.newPage();
  await login(creatorPage, "creator@haibu.test");
  await creatorPage.goto(`http://localhost:3000/bookings/${b1}/call`);
  await creatorPage.waitForSelector("div.relative.flex-1.min-h-0", { state: "visible", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 8000));

  await fanPage.screenshot({ path: `${SHOT}/tier1-final-fan.png` });
  await creatorPage.screenshot({ path: `${SHOT}/tier1-final-creator.png` });

  const fanFrame = fanPage.frames().find((f) => f.url().includes("daily.co"));
  const verify = await fanFrame.evaluate(() => {
    const tile = document.querySelector(".tile");
    const img = tile ? tile.querySelector(".noVideo img, [class*='noVideo'] img") : null;
    const leave = document.querySelector(".robots-btn-leave");
    const tray = document.querySelector(".tray");
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      tileBg: tile ? getComputedStyle(tile).backgroundColor : null,
      tileRect: tile ? r(tile) : null,
      avatarRect: img ? r(img) : null,
      leaveBg: leave ? getComputedStyle(leave).backgroundColor : null,
      trayRect: tray ? r(tray) : null,
      trayBg: tray ? getComputedStyle(tray).backgroundColor : null,
    };
  });
  console.log("CAMERA-OFF STATE:", JSON.stringify(verify, null, 1));

  await db.query(`DELETE FROM bookings WHERE id = $1`, [b1]);
  await browser.close();

  // ---- Camera ON: fake media device on booking-speaktest ----
  const b2 = await makeBooking(db, "booking-speaktest", "https://haibu.daily.co/booking-speaktest");
  const b2b = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const page2 = await (await b2b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await login(page2, "fan@haibu.test");
  await page2.goto(`http://localhost:3000/bookings/${b2}/call`);
  await page2.waitForSelector("div.relative.flex-1.min-h-0", { state: "visible", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 8000));
  await page2.screenshot({ path: `${SHOT}/tier1-final-camera-on.png` });
  const frame2 = page2.frames().find((f) => f.url().includes("daily.co"));
  const camState = await frame2.evaluate(() => {
    const video = document.querySelector(".tile video");
    return {
      videoPresent: !!video,
      videoPlaying: video ? !video.paused && video.readyState >= 2 : false,
      videoRect: video ? (() => { const b = video.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() : null,
    };
  });
  console.log("CAMERA-ON STATE:", JSON.stringify(camState, null, 1));

  await db.query(`DELETE FROM bookings WHERE id = $1`, [b2]);
  await db.end();
  await b2b.close();
  console.log("DONE");
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
