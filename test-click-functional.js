// Functional click verification + color-discipline evidence.
const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");

const DB = "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";

(async () => {
  const db = new Client({ connectionString: DB });
  await db.connect();
  const BOOKING = crypto.randomUUID();
  const s = new Date(Date.now() - 2 * 60000), e = new Date(Date.now() + 20 * 60000);
  await db.query(
    `INSERT INTO bookings (id, creator_id, fan_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, daily_room_name, daily_room_url) VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, 2500, 450, 2050, 'booking-evaltest', 'https://haibu.daily.co/booking-evaltest')`,
    [BOOKING, "073c016e-db44-460f-9c32-824ec9c7d367", "0d719919-6565-4063-8de2-772f63e25125", "8c1410e0-eddb-423d-86c8-c409a9f4ed87", s.toISOString(), e.toISOString()],
  );

  const browser = await chromium.launch();
  const join = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await p.fill('input[type="email"]', email);
    await p.fill('input[type="password"]', "haibu123");
    await p.click('button[type="submit"]');
    await p.waitForTimeout(2500);
    await p.goto(`http://localhost:3000/bookings/${BOOKING}/call`);
    await p.waitForSelector("div.relative.flex-1.min-h-0", { state: "visible", timeout: 30000 });
    return p;
  };
  const fanPage = await join("fan@haibu.test");
  const creatorPage = await join("creator@haibu.test");
  await new Promise((r) => setTimeout(r, 8000));

  const fanFrame = fanPage.frames().find((f) => f.url().includes("daily.co"));
  const creatorFrame = creatorPage.frames().find((f) => f.url().includes("daily.co"));

  const micClass = (frame) => frame.evaluate(() => {
    const b = document.querySelector(".robots-btn-mic-unmute, .robots-btn-mic-mute");
    return b ? String(b.className).match(/robots-btn-mic-\w+/)[0] : "missing";
  });

  // ---- FAN: mic toggle ----
  const fanMicBefore = await micClass(fanFrame);
  await fanFrame.click(".robots-btn-mic-unmute, .robots-btn-mic-mute");
  await new Promise((r) => setTimeout(r, 1500));
  const fanMicAfter = await micClass(fanFrame);
  console.log(`FAN mic: ${fanMicBefore} → click → ${fanMicAfter} (toggled: ${fanMicBefore !== fanMicAfter})`);

  // ---- CREATOR: mic toggle ----
  const creatorMicBefore = await micClass(creatorFrame);
  await creatorFrame.click(".robots-btn-mic-unmute, .robots-btn-mic-mute");
  await new Promise((r) => setTimeout(r, 1500));
  const creatorMicAfter = await micClass(creatorFrame);
  console.log(`CREATOR mic: ${creatorMicBefore} → click → ${creatorMicAfter} (toggled: ${creatorMicBefore !== creatorMicAfter})`);

  // ---- FAN: camera toggle ----
  const camClass = (frame) => frame.evaluate(() => {
    const b = document.querySelector(".robots-btn-cam-unmute, .robots-btn-cam-mute");
    return b ? String(b.className).match(/robots-btn-cam-\w+/)[0] : "missing";
  });
  const camBefore = await camClass(fanFrame);
  await fanFrame.click(".robots-btn-cam-unmute, .robots-btn-cam-mute");
  await new Promise((r) => setTimeout(r, 1500));
  const camAfter = await camClass(fanFrame);
  console.log(`FAN cam: ${camBefore} → click → ${camAfter} (toggled: ${camBefore !== camAfter})`);

  // ---- FAN: chat button opens panel ----
  await fanFrame.click(".robots-btn-chat-show");
  await new Promise((r) => setTimeout(r, 2000));
  const chatOpen = await fanFrame.evaluate(() => {
    const ta = document.querySelector('textarea[placeholder="Type a message…"]');
    const r = ta ? ta.getBoundingClientRect() : null;
    return r ? r.width > 0 : false;
  });
  console.log(`FAN chat panel opens: ${chatOpen}`);

  // ---- Color discipline: computed fills ----
  const colors = await fanFrame.evaluate(() => {
    const bg = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return {
      mic: bg(".robots-btn-mic-unmute, .robots-btn-mic-mute"),
      cam: bg(".robots-btn-cam-unmute, .robots-btn-cam-mute"),
      people: bg(".robots-btn-people-show"),
      leave: bg(".robots-btn-leave"),
    };
  });
  console.log("BUTTON COLORS:", JSON.stringify(colors));

  // Neutral screenshots (clean bar, before chat open)
  await fanPage.screenshot({ path: `${SHOT}/tier1-fix2-fan.png` });
  await creatorPage.screenshot({ path: `${SHOT}/tier1-fix2-creator.png` });

  // ---- FAN: leave actually leaves ----
  await fanFrame.click(".robots-btn-leave");
  const ended = await fanPage.waitForSelector("text=Session ended", { timeout: 10000 }).then(() => true).catch(() => false);
  console.log(`FAN leave → Session ended: ${ended}`);

  await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
  await db.end();
  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
