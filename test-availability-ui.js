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

  await page.goto(`${BASE}/creator/availability`, { waitUntil: "networkidle" });

  // --- Section present ---
  if (!(await page.locator("text=Specific dates").count())) {
    errors.push("Specific dates section missing");
  } else console.log("PASS: Specific dates section present");

  // --- Stage a NEW block via the block form ---
  const today = new Date();
  const bStart = new Date(today); bStart.setDate(bStart.getDate() + 3);
  const bEnd = new Date(bStart); bEnd.setDate(bEnd.getDate() + 1);
  const bStartStr = fmt(bStart), bEndStr = fmt(bEnd);
  console.log(`staging block ${bStartStr} → ${bEndStr}`);

  await page.click('button:has-text("Block a date")');
  await page.fill('input[aria-label="Block start date"]', bStartStr);
  await page.fill('input[aria-label="Block end date"]', bEndStr);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(300);

  // Block entry must appear in the combined list (label formatted like "Aug 15, 2026")
  const labelFmt = (iso) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const blockLabel = `${labelFmt(bStartStr)} – ${labelFmt(bEndStr)}`;
  if (!(await page.locator(`text=${blockLabel}`).count())) errors.push("staged block not visible in combined list");
  else console.log("PASS: staged block visible in combined list");

  // --- Stage an override via the override form ---
  const oDate = new Date(today); oDate.setDate(oDate.getDate() + 5);
  const oDateStr = fmt(oDate);
  console.log(`staging override ${oDateStr} 18:00–20:00`);

  await page.click('button:has-text("Open custom hours")');
  await page.fill('input[aria-label="Custom hours date"]', oDateStr);

  // Scope selects to the override form container (last date input's form area)
  const overrideForm = page.locator('input[aria-label="Custom hours date"]').locator("xpath=ancestor::div[contains(@class,\"rounded-input\")]");
  const selects = overrideForm.locator("select");
  const selCount = await selects.count();
  if (selCount < 2) errors.push(`override form time selects missing (${selCount})`);
  else {
    await selects.nth(0).selectOption({ value: "1080" }); // 18:00
    await selects.nth(1).selectOption({ value: "1200" }); // 20:00
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(300);

  const overrideLabel = `${labelFmt(oDateStr)} · 6:00 PM–8:00 PM`;
  if (!(await page.locator(`text=${overrideLabel}`).count())) errors.push("staged override not visible in combined list");
  else console.log("PASS: staged override visible in combined list");

  await page.screenshot({ path: `${SHOT}/availability-specific-dates-staged.png`, fullPage: true });
  console.log("shot: availability-specific-dates-staged.png");

  // --- Save availability (delete-and-reinsert everything) ---
  await page.click('button:has-text("Save availability")');
  await page.waitForSelector("text=Saved ✓", { timeout: 10000 });
  console.log("PASS: save confirmation shown");

  await page.screenshot({ path: `${SHOT}/availability-specific-dates-final.png`, fullPage: true });
  console.log("shot: availability-specific-dates-final.png");

  console.log(errors.length ? `FAILURES: ${errors.join(" | ")}` : "ALL UI CHECKS PASSED");
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
