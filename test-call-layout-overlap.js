// STANDING LAYOUT CHECK: the stage tile and the self-view tile must NOT
// overlap. Added after the finding that pixel/luminance checks alone cannot
// catch "self-view layered ON TOP of the stage" vs "self-view beside the
// stage" — both paint non-background pixels in the same region.
//
// Uses real getBoundingClientRect values for both elements and asserts the
// boxes are disjoint. Run alongside test-call-checklist.js for any change
// to the call screen.
//
// NOTE: this check currently FAILS — the self-view sits entirely inside the
// stage's footprint (the layout bug being tracked). It is kept as a standing
// check so the moment a fix lands, this flips to PASS and stays enforced.

const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");

(async () => {
  const db = new Client({ connectionString: "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres" });
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
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
      const a = r(stage), b = r(self);
      const intersects = a && b ? !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y) : null;
      const overlap = a && b && intersects
        ? { w: Math.min(a.right, b.right) - Math.max(a.x, b.x), h: Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) }
        : null;
      return { stage: a, self: b, intersects, overlap };
    });
    console.log(label, JSON.stringify(out));
    return out.intersects === false;
  };

  const closed = await check("CHAT CLOSED:");
  await fan.mouse.move(720, 400);
  await new Promise((res) => setTimeout(res, 400));
  await f.locator(".robots-btn-chat-show").click();
  await new Promise((res) => setTimeout(res, 2500));
  const open = await check("CHAT OPEN:");

  const pass = closed && open;
  console.log(`OVERLAP CHECK: ${pass ? "PASS (no overlap)" : "FAIL (tiles intersect) — the known layout bug"}`);

  await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
  await db.end();
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
