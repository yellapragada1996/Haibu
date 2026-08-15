const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";
const CREATOR = "073c016e-db44-460f-9c32-824ec9c7d367";

async function main() {
  const browser = await chromium.launch();
  const errors = [];

  // ============ CREATOR AVAILABILITY (fixes 1-5) ============
  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctxC.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "creator@haibu.test");
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/creator/**", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/creator/availability`, { waitUntil: "networkidle" });

  // FIX 1: select padding — check computed style of a time select
  const sel = page.locator("select").first();
  const selPad = await sel.evaluate((el) => getComputedStyle(el).paddingRight);
  console.log(`FIX1 select padding-right: ${selPad} (was 8px, expect ~32px)`);
  if (parseFloat(selPad) < 24) errors.push("select right padding too small");
  else console.log("PASS: select has arrow breathing room");

  // FIX 2: "Copy to" is a Button (has h-9/rounded-pill button styles)
  const copyBtn = page.locator('button:has-text("Copy to")').first();
  const copyCls = await copyBtn.getAttribute("class");
  console.log(`FIX2 copy-to classes: ${copyCls}`);
  if (!copyCls.includes("rounded-pill") || !copyCls.includes("h-9")) errors.push("Copy to not a Button");
  else console.log("PASS: Copy to styled as Button");

  // FIX 3: popover with Pills + Apply
  await copyBtn.click();
  await page.waitForTimeout(300);
  const pillCount = await page.locator('button.rounded-pill:has-text("Mon"), button.rounded-pill:has-text("Tue"), button.rounded-pill:has-text("Wed")').count();
  const applyBtn = await page.locator('button:has-text("Apply")').count();
  console.log(`FIX3 popover pills: ${pillCount}, Apply button: ${applyBtn}`);
  if (pillCount < 6 || !applyBtn) errors.push("popover pills/Apply missing");
  else console.log("PASS: popover shows day Pills + Apply");
  // Toggle a pill → active state
  await page.locator('button:has-text("Tue")').click();
  await page.waitForTimeout(200);
  const activeCls = await page.locator('button:has-text("Tue")').getAttribute("class");
  console.log(`FIX3 toggled Tue pill classes: ${activeCls}`);
  if (!activeCls.includes("bg-accent")) errors.push("pill active state missing");
  else console.log("PASS: pill toggles to --accent active state");
  await page.screenshot({ path: `${SHOT}/ux-copyto-popover.png`, fullPage: true });

  // FIX 4 & 5: renames
  const markBtn = await page.locator('button:has-text("Mark unavailable")').count();
  const addBtn = await page.locator('button:has-text("Add custom hours")').count();
  const oldBlockBtn = await page.locator('button:has-text("Block a date")').count();
  const oldOpenBtn = await page.locator('button:has-text("Open custom hours")').count();
  console.log(`FIX4/5: "Mark unavailable"=${markBtn}, "Add custom hours"=${addBtn}, old "Block a date"=${oldBlockBtn}, old "Open custom hours"=${oldOpenBtn}`);
  if (!markBtn || !addBtn || oldBlockBtn || oldOpenBtn) errors.push("button rename issue");
  else console.log("PASS: buttons renamed to matched pair");
  await page.screenshot({ path: `${SHOT}/ux-specific-dates-renamed.png`, fullPage: true });

  await page.screenshot({ path: `${SHOT}/ux-select-padding.png`, fullPage: true });
  await ctxC.close();

  // ============ BOOKING PAGE (fix 6) ============
  const ctxF = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fpage = await ctxF.newPage();
  await fpage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await fpage.fill('input[type="email"]', "fan@haibu.test");
  await fpage.fill('input[type="password"]', "haibu123");
  await fpage.click('button[type="submit"]');
  await fpage.waitForTimeout(2000);
  await fpage.goto(`${BASE}/book/${CREATOR}`, { waitUntil: "networkidle" });
  await fpage.click('button:has-text("Piano Lessons")');
  await fpage.waitForTimeout(2000);

  const rowWrap = fpage.locator("div.group").filter({ has: fpage.locator("button.rounded-pill").first() }).first();
  const rightArrow = fpage.locator('button[aria-label="Scroll dates right"]');
  const leftArrow = fpage.locator('button[aria-label="Scroll dates left"]');

  // Arrows hidden without hover
  const rightOpacityBefore = await rightArrow.evaluate((el) => getComputedStyle(el).opacity);
  console.log(`FIX6 right arrow opacity before hover: ${rightOpacityBefore} (expect 0)`);
  // Hover the row
  await rowWrap.hover();
  await fpage.waitForTimeout(400);
  const rightOpacityHover = await rightArrow.evaluate((el) => getComputedStyle(el).opacity);
  console.log(`FIX6 right arrow opacity on hover: ${rightOpacityHover} (expect 1)`);
  const leftCountHover = await leftArrow.count();
  console.log(`FIX6 left arrow at scroll start: ${leftCountHover} (expect 0 — nothing to the left)`);
  await fpage.screenshot({ path: `${SHOT}/ux-pill-arrows-start.png` });

  // Click right arrow → row scrolls, left arrow appears
  const scrollBefore = await fpage.locator(".horizontal-scroll").first().evaluate((el) => el.scrollLeft);
  await rightArrow.click();
  await fpage.waitForTimeout(800);
  const scrollAfter = await fpage.locator(".horizontal-scroll").first().evaluate((el) => el.scrollLeft);
  console.log(`FIX6 scrollLeft ${scrollBefore} → ${scrollAfter} (expect ~320)`);
  const leftCountAfter = await leftArrow.count();
  console.log(`FIX6 left arrow after scroll: ${leftCountAfter} (expect 1)`);
  await fpage.screenshot({ path: `${SHOT}/ux-pill-arrows-scrolled.png` });

  // Scroll to end → right arrow disappears
  await fpage.locator(".horizontal-scroll").first().evaluate((el) => { el.scrollLeft = el.scrollWidth; el.dispatchEvent(new Event("scroll")); });
  await fpage.waitForTimeout(500);
  const rightCountEnd = await rightArrow.count();
  console.log(`FIX6 right arrow at end: ${rightCountEnd} (expect 0)`);
  await fpage.screenshot({ path: `${SHOT}/ux-pill-arrows-end.png` });

  if (parseFloat(rightOpacityBefore) !== 0) errors.push("arrows visible without hover");
  if (parseFloat(rightOpacityHover) < 0.9) errors.push("right arrow not visible on hover");
  if (leftCountHover !== 0) errors.push("left arrow shown at start");
  if (scrollAfter - scrollBefore < 200) errors.push("right arrow did not scroll");
  if (leftCountAfter !== 1) errors.push("left arrow missing after scroll");
  if (rightCountEnd !== 0) errors.push("right arrow shown at end");
  if (!errors.length) console.log("PASS: scroll arrows behave correctly");

  await ctxF.close();
  await browser.close();

  console.log(errors.length ? `FAILURES: ${errors.join(" | ")}` : "ALL 6 FIXES VERIFIED");
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
