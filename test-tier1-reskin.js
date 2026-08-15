// Two-window live test for the Tier 1 call screen reskin (real screenshots).
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
  const login = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await p.fill('input[type="email"]', email);
    await p.fill('input[type="password"]', "haibu123");
    await p.click('button[type="submit"]');
    await p.waitForTimeout(2500);
    return { ctx, p };
  };

  const fan = await login("fan@haibu.test");
  const creator = await login("creator@haibu.test");
  const callUrl = `http://localhost:3000/bookings/${BOOKING}/call`;
  await Promise.all([
    fan.p.goto(callUrl),
    creator.p.goto(callUrl),
  ]);
  await fan.p.waitForSelector("div.flex-1.min-h-0", { state: "visible", timeout: 30000 });
  await creator.p.waitForSelector("div.flex-1.min-h-0", { state: "visible", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 8000));

  console.log("both in call — screenshots");
  await fan.p.screenshot({ path: `${SHOT}/tier1-fan-full.png` });
  await creator.p.screenshot({ path: `${SHOT}/tier1-creator-full.png` });

  // DOM checks inside Daily frame (fan side): tray style, tile radius, name pill
  const fanFrame = fan.p.frames().find((f) => f.url().includes("daily.co"));
  const styles = await fanFrame.evaluate(() => {
    const tray = document.querySelector(".tray");
    const tile = document.querySelector(".tile");
    const info = document.querySelector(".tile-info");
    const active = document.querySelector("div.active > .tile");
    const s = (el) => (el ? getComputedStyle(el) : null);
    return {
      tray: tray ? { pos: s(tray).position, bottom: s(tray).bottom, radius: s(tray).borderRadius, width: Math.round(tray.getBoundingClientRect().width) } : null,
      tile: tile ? { radius: s(tile).borderRadius, bg: s(tile).backgroundColor } : null,
      info: info ? { pos: s(info).position, radius: s(info).borderRadius, bg: s(info).backgroundColor } : null,
      activeRing: active ? { outline: s(active).outline } : null,
    };
  });
  console.log("STYLES:", JSON.stringify(styles, null, 1));

  // Chat: fan opens panel, types a message
  await fanFrame.click(".robots-btn-chat-show");
  await new Promise((r) => setTimeout(r, 2000));
  await fanFrame.fill('textarea[placeholder="Type a message…"]', "hey! ready when you are");
  await fanFrame.press('textarea[placeholder="Type a message…"]', "Enter");
  await new Promise((r) => setTimeout(r, 4000));
  await fan.p.screenshot({ path: `${SHOT}/tier1-fan-chat.png` });

  // Message row classes (sent vs received) for bubble styling refinement
  const msgInfo = await fanFrame.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".messages > *"));
    return rows.slice(0, 4).map((el) => ({
      cls: String(el.className).slice(0, 140),
      text: (el.textContent || "").slice(0, 60),
    }));
  });
  console.log("MESSAGE ROWS:", JSON.stringify(msgInfo, null, 1));

  // Creator side: open chat to see the incoming message
  const creatorFrame = creator.p.frames().find((f) => f.url().includes("daily.co"));
  await creatorFrame.click(".robots-btn-chat-show");
  await new Promise((r) => setTimeout(r, 2500));
  await creator.p.screenshot({ path: `${SHOT}/tier1-creator-chat.png` });

  // Crop screenshots of the control bar region from fan window
  const trayBox = await fanFrame.locator(".tray").boundingBox();
  if (trayBox) {
    const clip = { x: Math.max(0, trayBox.x - 60), y: Math.max(0, trayBox.y - 30), width: trayBox.width + 120, height: trayBox.height + 60 };
    await fan.p.screenshot({ path: `${SHOT}/tier1-control-bar.png`, clip });
  }

  await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
  await db.end();
  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
