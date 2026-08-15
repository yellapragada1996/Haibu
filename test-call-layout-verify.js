// STANDING LAYOUT VERIFICATION — run after any change to the call screen.
//
// Covers, in one headed run against a real two-participant session:
//   1. Rect-intersection check (stage vs self-view must never overlap).
//   2. Pixel-based centering (gapLeft / gapRight / centerOffset) with CORRECT
//      rect reading (fixes the bug that was in test-call-layout-measure.js).
//   3. ?debug-layout=1 colored-outline screenshots for 1440x780 + 1440x900,
//      chat closed + open.
//
// Usage (dev server running): node test-call-layout-verify.js

const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const crypto = require("crypto");

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1440, h: 780 },
  { w: 1366, h: 768 },
  { w: 1280, h: 720 },
  { w: 1100, h: 700 },
];

const measure = (frame) =>
  frame.evaluate(() => {
    const W = window.innerWidth;
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) };
    };
    const stage = rect(document.querySelector(".tile:not(.local)"));
    const self = rect(document.querySelector(".fixed .tile.local"));
    const sidebar = rect(document.querySelector(".sidebar"));

    const intersects = stage && self
      ? !(stage.right <= self.x || self.right <= stage.x || stage.bottom <= self.y || self.bottom <= stage.y)
      : null;
    // Reserved strip is 224px (192 self-view + 16px margin each side), starting
    // at the stage's right edge — in chat-closed the strip ends at the viewport
    // edge; in chat-open it ends at the chat panel's left edge. Measuring to
    // (stage.right + 224) works for BOTH states without locating the chat panel.
    const STRIP = 224;
    const gapLeft = stage && self ? +(self.x - stage.right).toFixed(1) : null;
    const gapRight = stage && self ? +((stage.right + STRIP) - self.right).toFixed(1) : null;
    const centerOffset = gapLeft !== null && gapRight !== null ? +((gapLeft - gapRight) / 2).toFixed(1) : null;

    return {
      W,
      stage,
      self,
      sidebar,
      intersects,
      gapLeft,
      gapRight,
      centerOffset,
    };
  });

async function main() {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  const BOOKING = crypto.randomUUID();
  const s = new Date(Date.now() - 2 * 60000);
  const e = new Date(Date.now() + 20 * 60000);
  await db.query(
    `INSERT INTO bookings (id, creator_id, fan_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, daily_room_name, daily_room_url)
     VALUES ($1,$2,$3,$4,'confirmed',$5,$6,2500,450,2050,'booking-manual-test','https://haibu.daily.co/booking-manual-test')`,
    [BOOKING, "073c016e-db44-460f-9c32-824ec9c7d367", "0d719919-6565-4063-8de2-772f63e25125", "8c1410e0-eddb-423d-86c8-c409a9f4ed87", s.toISOString(), e.toISOString()],
  );

  const browser = await chromium.launch({ headless: false });

  const join = async (email, debug) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await p.fill('input[type="email"]', email);
    await p.fill('input[type="password"]', "haibu123");
    await p.click('button[type="submit"]');
    await p.waitForTimeout(2500);
    await p.goto(`http://localhost:3000/bookings/${BOOKING}/call${debug ? "?debug-layout=1" : ""}`);
    await p.waitForSelector("div.relative.flex-1.min-h-0", { state: "visible", timeout: 30000 });
    return { ctx, p };
  };

  const results = [];

  try {
    const fan = await join("fan@haibu.test", false);
    const creator = await join("creator@haibu.test", false);
    await new Promise((r) => setTimeout(r, 8000));
    const fanFrame = fan.p.frames().find((f) => f.url().includes("daily.co"));

    const runPass = async (label) => {
      for (const vp of VIEWPORTS) {
        await fan.p.setViewportSize({ width: vp.w, height: vp.h });
        await creator.p.setViewportSize({ width: vp.w, height: vp.h });
        await new Promise((r) => setTimeout(r, 2500));
        const m = await measure(fanFrame);
        const ok = m.intersects === false && Math.abs(m.centerOffset) < 0.5;
        results.push({ label, vp: `${vp.w}x${vp.h}`, ok, ...m });
        console.log(
          `${label} ${vp.w}x${vp.h}: stage.w=${m.stage?.w} self.x=${m.self?.x} self.right=${m.self?.right} ` +
          `gapLeft=${m.gapLeft} gapRight=${m.gapRight} centerOffset=${m.centerOffset} overlap=${m.intersects} -> ${ok ? "PASS" : "FAIL"}`,
        );
      }
    };

    console.log("===== CHAT CLOSED =====");
    await runPass("closed");

    console.log("===== CHAT OPEN =====");
    await fan.p.mouse.move(720, 400);
    await new Promise((r) => setTimeout(r, 400));
    await fanFrame.locator(".robots-btn-chat-show").click();
    await new Promise((r) => setTimeout(r, 2500));
    await runPass("open");

    // ---- Debug-layout screenshots (fresh frames with the outline CSS) ----
    await fan.p.goto(`http://localhost:3000/bookings/${BOOKING}/call?debug-layout=1`);
    await creator.p.goto(`http://localhost:3000/bookings/${BOOKING}/call?debug-layout=1`);
    await fan.p.waitForSelector("div.relative.flex-1.min-h-0", { state: "visible", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 6000));
    const debugFrame = fan.p.frames().find((f) => f.url().includes("daily.co"));

    const shot = async (name, vp) => {
      await fan.p.setViewportSize({ width: vp.w, height: vp.h });
      await creator.p.setViewportSize({ width: vp.w, height: vp.h });
      await new Promise((r) => setTimeout(r, 2500));
      await fan.p.screenshot({ path: `${SHOT}/${name}.png` });
      console.log(`screenshot -> ${name}.png`);
    };

    console.log("===== DEBUG-LAYOUT SCREENSHOTS =====");
    await shot("verify-debug-1440x780-closed", { w: 1440, h: 780 });
    await shot("verify-debug-1440x900-closed", { w: 1440, h: 900 });
    await fan.p.mouse.move(720, 400);
    await new Promise((r) => setTimeout(r, 400));
    await debugFrame.locator(".robots-btn-chat-show").click();
    await new Promise((r) => setTimeout(r, 2500));
    await shot("verify-debug-1440x780-open", { w: 1440, h: 780 });
    await shot("verify-debug-1440x900-open", { w: 1440, h: 900 });

    const pass = results.filter((r) => r.ok).length;
    console.log(`\n===== SUMMARY: ${pass}/${results.length} PASS =====`);
  } finally {
    await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
    await db.end();
    await browser.close();
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
