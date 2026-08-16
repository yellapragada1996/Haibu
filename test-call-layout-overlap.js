// STANDING LAYOUT CHECK (V1 overlay model): the stage tile must fill the
// frame, and the self-view must be a SMALL PiP contained within the stage's
// bottom-right corner. It intentionally overlaps the stage (that's the
// overlay model) — the old "disjoint" assertion is gone.
//
// Uses real getBoundingClientRect values for both elements. Run alongside
// test-call-checklist.js for any change to the call screen.

const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

(async () => {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  const BOOKING = crypto.randomUUID();
  const s = new Date(Date.now() - 2 * 60000), e = new Date(Date.now() + 20 * 60000);
  await db.query(
    `INSERT INTO bookings (id, creator_id, fan_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, daily_room_name, daily_room_url) VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, 2500, 450, 2050, 'booking-manual-test', 'https://haibu.daily.co/booking-manual-test')`,
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
    await p.waitForSelector("div.relative.flex-1.min-h-0", { state: "visible", timeout: 30000 });
    return p;
  };
  const fan = await join("fan@haibu.test");
  await join("creator@haibu.test");
  await new Promise((r) => setTimeout(r, 8000));
  const f = fan.frames().find((fr) => fr.url().includes("daily.co"));

  const check = async (label) => {
    const out = await f.evaluate(() => {
      const stage = document.querySelector(".tile:not(.local)");
      const self = document.querySelector(".fixed .tile.local");
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), right: Math.round(b.right), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
      const a = r(stage), b = r(self);
      const small = b ? b.w < 320 && b.h < 240 : false;
      const contained = a && b ? b.right <= a.right + 1 && b.bottom <= a.bottom + 1 : false;
      const bottomRight = a && b
        ? Math.abs(b.right - (a.right - 16)) < 24 && Math.abs(b.bottom - (a.bottom - 16)) < 24
        : false;
      return { stage: a, self: b, small, contained, bottomRight };
    });
    console.log(label, JSON.stringify(out));
    return out.small && out.contained && out.bottomRight;
  };

  const closed = await check("CHAT CLOSED:");
  await fan.mouse.move(720, 400);
  await new Promise((res) => setTimeout(res, 400));
  await f.locator(".robots-btn-chat-show").click();
  await new Promise((res) => setTimeout(res, 2500));
  const open = await check("CHAT OPEN:");

  const pass = closed && open;
  console.log(`OVERLAY CHECK: ${pass ? "PASS (stage full, self-view small bottom-right PiP)" : "FAIL"}`);

  await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
  await db.end();
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
