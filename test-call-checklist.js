// FULL functional checklist in GRID view, both windows (standing rule).
const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");

const DB = "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

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
    // Standing item: ZERO console/page errors from load through leave. The
    // 9/9 functional checks previously passed while join errors were firing —
    // this closes that blind spot permanently.
    const consoleErrors = [];
    p.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(`[console] ${m.text().slice(0, 200)}`);
    });
    p.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 200)}`));
    await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await p.fill('input[type="email"]', email);
    await p.fill('input[type="password"]', "haibu123");
    await p.click('button[type="submit"]');
    await p.waitForTimeout(2500);
    await p.goto(`http://localhost:3000/bookings/${BOOKING}/call`);
    await p.waitForSelector("div.relative.flex-1.min-h-0", { state: "visible", timeout: 30000 });
    return { p, consoleErrors, frame: () => p.frames().find((f) => f.url().includes("daily.co")) };
  };

  const fan = await join("fan@haibu.test");
  const creator = await join("creator@haibu.test");
  await new Promise((r) => setTimeout(r, 8000));
  const results = [];

  // FaceTime auto-hide: controls fade after 4s idle and a wake layer is
  // armed — wake the controls before every interaction (move the mouse over
  // the video area), matching the real user flow.
  const wake = async (p) => {
    await p.mouse.move(720, 400);
    await new Promise((r) => setTimeout(r, 400));
  };

  const micClass = (f) => f.evaluate(() => {
    const b = document.querySelector(".robots-btn-mic-unmute, .robots-btn-mic-mute");
    return b ? String(b.className).match(/robots-btn-mic-\w+/)[0] : "missing";
  });
  const camClass = (f) => f.evaluate(() => {
    const b = document.querySelector(".robots-btn-cam-unmute, .robots-btn-cam-mute");
    return b ? String(b.className).match(/robots-btn-cam-\w+/)[0] : "missing";
  });

  // 1. Mic toggles, both windows (real mouse click at button coordinates)
  for (const [label, side] of [["FAN", fan], ["CREATOR", creator]]) {
    const f = side.frame();
    await wake(side.p);
    const before = await micClass(f);
    await f.locator(".robots-btn-mic-unmute, .robots-btn-mic-mute").click();
    await new Promise((r) => setTimeout(r, 1500));
    const after = await micClass(f);
    results.push(`${label} mic: ${before} → ${after} (${before !== after ? "PASS" : "FAIL"})`);
  }

  // 2. Camera toggles, both windows
  for (const [label, side] of [["FAN", fan], ["CREATOR", creator]]) {
    const f = side.frame();
    await wake(side.p);
    const before = await camClass(f);
    await f.locator(".robots-btn-cam-unmute, .robots-btn-cam-mute").click();
    await new Promise((r) => setTimeout(r, 1500));
    const after = await camClass(f);
    results.push(`${label} cam: ${before} → ${after} (${before !== after ? "PASS" : "FAIL"})`);
  }

  // 3. Chat opens + message sends in BOTH windows
  for (const [label, side] of [["FAN", fan], ["CREATOR", creator]]) {
    const f = side.frame();
    await wake(side.p);
    await f.locator(".robots-btn-chat-show").click();
    await new Promise((r) => setTimeout(r, 2000));
    const inputVisible = await f.locator('textarea[placeholder="Type a message…"]').isVisible().catch(() => false);
    const msg = `${label.toLowerCase()} says hi from ${label}`;
    await f.fill('textarea[placeholder="Type a message…"]', msg);
    await f.press('textarea[placeholder="Type a message…"]', "Enter");
    await new Promise((r) => setTimeout(r, 2500));
    const sent = await f.evaluate((m) => {
      const inner = document.querySelector(".messages-inner");
      return inner ? inner.textContent.includes(m) : false;
    }, msg);
    results.push(`${label} chat open+send: ${inputVisible && sent ? "PASS" : "FAIL"} (inputVisible=${inputVisible}, sent=${sent})`);
  }

  // Cross-check: each side sees the other's message
  const fanFrame = fan.frame();
  const creatorFrame = creator.frame();
  const fanSeesCreatorMsg = await fanFrame.evaluate(() => {
    const inner = document.querySelector(".messages-inner");
    return inner ? inner.textContent.includes("creator says hi") : false;
  });
  const creatorSeesFanMsg = await creatorFrame.evaluate(() => {
    const inner = document.querySelector(".messages-inner");
    return inner ? inner.textContent.includes("fan says hi") : false;
  });
  results.push(`cross-delivery: fanSeesCreator=${fanSeesCreatorMsg}, creatorSeesFan=${creatorSeesFanMsg} (${fanSeesCreatorMsg && creatorSeesFanMsg ? "PASS" : "FAIL"})`);

  // 4. Leave ends the session — FAN first, then CREATOR
  {
    const f = fan.frame();
    await wake(fan.p);
    await f.locator(".robots-btn-leave").click();
    const ended = await fan.p.waitForSelector("text=Session ended", { timeout: 10000 }).then(() => true).catch(() => false);
    results.push(`FAN leave → ended: ${ended ? "PASS" : "FAIL"}`);
  }
  {
    const f = creator.frame();
    await wake(creator.p);
    await f.locator(".robots-btn-leave").click();
    const ended = await creator.p.waitForSelector("text=Session ended", { timeout: 10000 }).then(() => true).catch(() => false);
    results.push(`CREATOR leave → ended: ${ended ? "PASS" : "FAIL"}`);
  }

  console.log(results.join("\n"));

  // Standing item: zero console/page errors in BOTH windows, whole session.
  const fanErrors = fan.consoleErrors, creatorErrors = creator.consoleErrors;
  if (fanErrors.length > 0 || creatorErrors.length > 0) {
    console.log("CONSOLE ERRORS (FAIL):");
    fanErrors.forEach((e) => console.log("  FAN " + e));
    creatorErrors.forEach((e) => console.log("  CREATOR " + e));
    console.log("ZERO-CONSOLE-ERRORS: FAIL");
  } else {
    console.log("ZERO-CONSOLE-ERRORS: PASS (both windows, load → leave)");
  }

  await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
  await db.end();
  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
