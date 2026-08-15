const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";

const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "creator@haibu.test");
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/creator/**", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/creator/availability`, { waitUntil: "networkidle" });

  // --- Stage a block Aug 20 → 25 ---
  await page.click('button:has-text("Block a date")');
  await page.fill('input[aria-label="Block start date"]', "2026-08-20");
  await page.fill('input[aria-label="Block end date"]', "2026-08-25");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(300);

  // --- #2: override form warning for a date inside the block ---
  await page.click('button:has-text("Open custom hours")');
  await page.fill('input[aria-label="Custom hours date"]', "2026-08-22");
  await page.waitForTimeout(200);
  const formWarn = await page.locator("text=This date is already marked unavailable").count();
  if (!formWarn) errors.push("override-form warning missing");
  else console.log("PASS: override form shows inline warning for blocked date");
  await page.screenshot({ path: `${SHOT}/availability-shadow-override-form-warning.png`, fullPage: true });

  // Stage the override anyway (not a hard block)
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(300);

  // --- #1: combined list shadow note ---
  const note = await page.locator("text=Overridden by your block on Aug 20, 2026 – Aug 25, 2026 — has no effect").count();
  if (!note) errors.push("combined-list shadow note missing");
  else console.log("PASS: combined list shows 'has no effect' note on shadowed override");
  await page.screenshot({ path: `${SHOT}/availability-shadow-combined-list.png`, fullPage: true });

  // --- #2 (vice versa): block form warning covering existing override Aug 17 ---
  await page.click('button:has-text("Block a date")');
  await page.fill('input[aria-label="Block start date"]', "2026-08-16");
  await page.fill('input[aria-label="Block end date"]', "2026-08-18");
  await page.waitForTimeout(200);
  const blockWarn = await page.locator("text=This range covers 1 custom-hours date").count();
  if (!blockWarn) errors.push("block-form warning missing");
  else console.log("PASS: block form warns about covering an existing custom-hours date");
  await page.screenshot({ path: `${SHOT}/availability-shadow-block-form-warning.png`, fullPage: true });

  console.log(errors.length ? `FAILURES: ${errors.join(" | ")}` : "ALL SHADOW-WARNING CHECKS PASSED");
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
