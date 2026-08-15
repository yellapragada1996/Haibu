// INVESTIGATION TOOL — inspect the stage tile's actual inline/computed CSS
// inside the Daily iframe, at the failing viewport (1440x780) vs. working
// viewports, to find the exact mechanism that shrinks the stage to 16:9.
//
// Read-only w.r.t. the app: only inserts + deletes a throwaway booking row.
// Usage (dev server running): node test-inspect-stage-tile.js

const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const crypto = require("crypto");

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const VIEWPORTS = [
  { w: 1440, h: 900 }, // working reference
  { w: 1440, h: 780 }, // FAILING
  { w: 1366, h: 768 }, // working
  { w: 1280, h: 720 }, // working
  { w: 1100, h: 700 }, // working
];

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
    await new Promise((r) => setTimeout(r, 8000));

    const inspect = (frame) =>
      frame.evaluate(() => {
        const rect = (el) => {
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
        };
        const css = (el) => {
          if (!el) return null;
          const c = getComputedStyle(el);
          return {
            width: c.width,
            height: c.height,
            aspectRatio: c.aspectRatio,
            maxWidth: c.maxWidth,
            minWidth: c.minWidth,
            maxHeight: c.maxHeight,
            minHeight: c.minHeight,
            display: c.display,
            position: c.position,
            flex: c.flex,
            flexGrow: c.flexGrow,
            flexShrink: c.flexShrink,
            flexBasis: c.flexBasis,
            alignSelf: c.alignSelf,
            justifyContent: c.justifyContent,
            boxSizing: c.boxSizing,
            objectFit: c.objectFit,
            overflow: c.overflow,
            transform: c.transform,
          };
        };
        const info = (el, label) => ({
          label,
          tag: el?.tagName ?? null,
          className: el?.className ?? null,
          inlineStyle: el?.getAttribute("style") ?? null,
          rect: rect(el),
          computed: css(el),
        });

        const stage = document.querySelector(".tile:not(.local)");
        const video = stage?.querySelector("video") ?? null;
        const parent = stage?.parentElement ?? null;
        const grandparent = parent?.parentElement ?? null;

        return {
          viewport: [window.innerWidth, window.innerHeight],
          stage: info(stage, "stage(.tile:not(.local))"),
          video: info(video, "stage video"),
          parent: info(parent, "stage parent"),
          grandparent: info(grandparent, "stage grandparent"),
        };
      });

    for (const vp of VIEWPORTS) {
      await fan.p.setViewportSize({ width: vp.w, height: vp.h });
      await creator.p.setViewportSize({ width: vp.w, height: vp.h });
      await new Promise((r) => setTimeout(r, 3000));
      const frame = fan.p.frames().find((f) => f.url().includes("daily.co"));
      if (!frame) { console.log(`\n===== ${vp.w}x${vp.h} ===== NO DAILY FRAME`); continue; }
      const out = await inspect(frame);
      console.log(`\n===== ${vp.w}x${vp.h} (fan window) =====`);
      console.log(JSON.stringify(out, null, 2));
    }
  } finally {
    await db.query(`DELETE FROM bookings WHERE id = $1`, [BOOKING]);
    await db.end();
    await browser.close();
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
