// Final verification of the 5-issue fix round (fresh screenshots).
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
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await p.fill('input[type="email"]', email);
    await p.fill('input[type="password"]', "haibu123");
    await p.click('button[type="submit"]');
    await p.waitForTimeout(2500);
    await p.goto(`http://localhost:3000/bookings/${BOOKING}/call`);
    await p.waitForSelector("div.flex-1.min-h-0", { state: "visible", timeout: 30000 });
    return { ctx, p };
  };

  const fan = await join("fan@haibu.test");
  const creator = await join("creator@haibu.test");
  await new Promise((r) => setTimeout(r, 8000));

  const fanFrame = fan.p.frames().find((f) => f.url().includes("daily.co"));

  const checks = await fanFrame.evaluate(() => {
    const visible = (el) => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none";

    // 1. Tray button labels hidden?
    const trayText = document.querySelector(".tray").innerText.trim();
    const trayVisibleSpans = Array.from(document.querySelectorAll(".tray button span")).filter((sp) => visible(sp)).length;

    // 2. Tile-info shrink-to-fit?
    const info = document.querySelector(".tile-info");
    const infoRect = info ? info.getBoundingClientRect() : null;

    // 3. Ring: which tiles have the red outline + which have Daily's inline outline
    const tiles = Array.from(document.querySelectorAll(".tile")).map((t) => ({
      local: String(t.className).includes("local"),
      hasDailyOutline: (t.getAttribute("style") || "").includes("outline"),
      computedOutline: getComputedStyle(t).outline,
    }));

    // 4. Hidden chrome
    const hidden = {
      settings: !visible(document.querySelector(".settings-btn")),
      gridToggle: !visible(document.querySelector(".robots-btn-grid-view-switch")),
      speakerToggle: !visible(document.querySelector(".robots-btn-speaker-view-noop")),
      topbarLabels: Array.from(document.querySelectorAll(".topbar [class*='default']")).filter(visible).length === 0,
    };

    return { trayText, trayVisibleSpans, infoRect: infoRect ? { w: Math.round(infoRect.width), h: Math.round(infoRect.height) } : null, tiles, hidden };
  });
  console.log(JSON.stringify(checks, null, 1));

  await fan.p.screenshot({ path: `${SHOT}/tier1-fix-fan.png` });
  await creator.p.screenshot({ path: `${SHOT}/tier1-fix-creator.png` });

  // Chat open + message, then search for "Download"
  await fanFrame.evaluate(() => document.querySelector(".robots-btn-chat-show")?.click());
  await new Promise((r) => setTimeout(r, 2000));
  await fanFrame.fill('textarea[placeholder="Type a message…"]', "final check");
  await fanFrame.press('textarea[placeholder="Type a message…"]', "Enter");
  await new Promise((r) => setTimeout(r, 3000));
  const chatState = await fanFrame.evaluate(() => {
    const charLimitVisible = (() => { const el = document.querySelector(".char-limit"); return el && getComputedStyle(el).display !== "none"; })();
    const downloadHits = Array.from(document.querySelectorAll("*")).filter((el) => el.children.length === 0 && /download/i.test(el.textContent || "")).map((el) => ({ cls: String(el.className).slice(0, 60), text: (el.textContent || "").trim() }));
    return { charLimitVisible, downloadHits: downloadHits.slice(0, 5) };
  });
  console.log("CHAT STATE:", JSON.stringify(chatState, null, 1));
  await fan.p.screenshot({ path: `${SHOT}/tier1-fix-chat.png` });

  await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
  await db.end();
  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
