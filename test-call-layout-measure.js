// Step 1 measurement — centered-self-view geometry (option 3, CSS-only fix).
//
// Purpose: measure the two quantities that fully determine whether the
// self-view tile is horizontally centered in its reserved strip:
//   (1) S = Daily's real "sidebar width + gap" (the code assumes 193px,
//       baked into the stage's `calc(100% - 31px)` constant), and
//   (2) the self-view element's rendered width vs its spec'd 192px
//       (Candidate A: the `.fixed` wrapper being wider than the tile).
//
// Reads live getBoundingClientRect inside the Daily iframe (privileged
// browser access — not shippable, dev-only), across five viewport sizes,
// chat-closed, in BOTH participant windows.
//
// Usage (dev server must be running: `npm run dev`):
//   node test-call-layout-measure.js            # headed (real window)
//   node test-call-layout-measure.js --headless # smoke test only

const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");

const DB = "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";
const HEADLESS = process.argv.includes("--headless");

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1440, h: 780 },
  { w: 1366, h: 768 },
  { w: 1280, h: 720 },
  { w: 1100, h: 700 },
];

// Everything is measured inside the Daily iframe's own coordinate space, so
// "W" = iframe innerWidth and all rects are iframe-relative. The 31px is the
// stage-narrowing constant in DAILY_CSS (`.tile:not(.local)` width).
const measure = (frame) =>
  frame.evaluate(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        x: +b.x.toFixed(1),
        y: +b.y.toFixed(1),
        w: +b.width.toFixed(1),
        h: +b.height.toFixed(1),
        right: +b.right.toFixed(1),
        bottom: +b.bottom.toFixed(1),
      };
    };

    const sidebarEl = document.querySelector(".sidebar");
    const fixedEl = document.querySelector(".fixed");
    const selfTileEl = document.querySelector(".fixed .tile.local");
    const sidebar = rect(sidebarEl);
    const fixed = rect(fixedEl);
    const selfTile = rect(selfTileEl);
    const stages = Array.from(document.querySelectorAll(".tile:not(.local)")).map(rect);
    const stage = stages[0] || null;

    // S = sidebar + gap, recovered from the stage width: stage.w = (W - S) - 31.
    const S = stage ? +(W - 31 - stage.w).toFixed(1) : null;
    const gap = S !== null && sidebar ? +(S - sidebar.w).toFixed(1) : null;
    const gapLeft = stage && selfTile ? +(selfTile.x - stage.right).toFixed(1) : null;
    const gapRight = selfTile ? +(W - selfTile.right).toFixed(1) : null;
    // >0 means the .fixed wrapper is wider than the actual tile (Candidate A).
    const wrapperVsTile = fixed && selfTile ? +(fixed.w - selfTile.w).toFixed(1) : null;
    // Tile center offset from strip center, px; + = tile too far right.
    const centerOffset =
      gapLeft !== null && gapRight !== null ? +((gapLeft - gapRight) / 2).toFixed(1) : null;

    return {
      viewport: [W, H],
      sidebar,
      fixed,
      selfTile,
      stage,
      stageCount: stages.length,
      fixedInsideSidebar: !!(fixedEl && sidebarEl && sidebarEl.contains(fixedEl)),
      derived: { S, gap, gapLeft, gapRight, wrapperVsTile, centerOffset },
    };
  });

(async () => {
  const db = new Client({ connectionString: DB });
  await db.connect();
  const BOOKING = crypto.randomUUID();
  const s = new Date(Date.now() - 2 * 60000), e = new Date(Date.now() + 20 * 60000);
  await db.query(
    `INSERT INTO bookings (id, creator_id, fan_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, daily_room_name, daily_room_url) VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, 2500, 450, 2050, 'booking-manual-test', 'https://haibu.daily.co/booking-manual-test')`,
    [BOOKING, "073c016e-db44-460f-9c32-824ec9c7d367", "0d719919-6565-4063-8de2-772f63e25125", "8c1410e0-eddb-423d-86c8-c409a9f4ed87", s.toISOString(), e.toISOString()],
  );

  const browser = await chromium.launch({ headless: HEADLESS });
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
    return { ctx, p };
  };

  try {
    const fan = await join("fan@haibu.test");
    const creator = await join("creator@haibu.test");
    await new Promise((r) => setTimeout(r, 8000)); // let media + layout settle

    for (const vp of VIEWPORTS) {
      await fan.p.setViewportSize({ width: vp.w, height: vp.h });
      await creator.p.setViewportSize({ width: vp.w, height: vp.h });
      await new Promise((r) => setTimeout(r, 3000)); // reflow after resize

      const fanFrame = fan.p.frames().find((f) => f.url().includes("daily.co"));
      const creatorFrame = creator.p.frames().find((f) => f.url().includes("daily.co"));

      if (!fanFrame || !creatorFrame) {
        console.log(`=== ${vp.w}x${vp.h} === DAILY FRAME MISSING (fan=${!!fanFrame} creator=${!!creatorFrame})`);
        continue;
      }

      const mFan = await measure(fanFrame);
      const mCreator = await measure(creatorFrame);
      console.log(`\n=== ${vp.w}x${vp.h} FAN ===`);
      console.log(JSON.stringify(mFan, null, 2));
      console.log(`=== ${vp.w}x${vp.h} CREATOR ===`);
      console.log(JSON.stringify(mCreator, null, 2));

      await fan.p.screenshot({ path: `${SHOT}/measure-${vp.w}x${vp.h}-fan.png` });
      await creator.p.screenshot({ path: `${SHOT}/measure-${vp.w}x${vp.h}-creator.png` });
    }
  } finally {
    await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
    await db.end();
    await browser.close();
  }
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
