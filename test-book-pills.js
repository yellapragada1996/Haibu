const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOT = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";
const CREATOR = "073c016e-db44-460f-9c32-824ec9c7d367";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Login as fan
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "fan@haibu.test");
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/*", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/book/${CREATOR}`, { waitUntil: "networkidle" });

  // Select Piano Lessons (30 min)
  await page.click('button:has-text("Piano Lessons")');
  await page.waitForTimeout(2000);

  const pills = page.locator("button.rounded-pill");
  const count = await pills.count();
  console.log(`PILL COUNT: ${count} (was capped at ~6, expect up to 30 dates)`);

  const labels = [];
  for (let i = 0; i < count; i++) {
    labels.push(await pills.nth(i).innerText());
  }
  console.log("LABELS:", JSON.stringify(labels));

  // Verify weekday format "Wed, Aug 12" on every pill
  const weekdayRe = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$/;
  const badLabels = labels.filter((l) => !weekdayRe.test(l.trim()));
  if (badLabels.length) console.log("BAD LABELS:", JSON.stringify(badLabels));
  else console.log("PASS: all pill labels match 'Weekday, Mon DD' single-line format");

  // Verify no wrap: each pill's scrollHeight should equal clientHeight
  let wrapped = false;
  for (let i = 0; i < count; i++) {
    const m = await pills.nth(i).evaluate((el) => ({
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
      sw: el.scrollWidth,
      cw: el.clientWidth,
    }));
    if (m.scrollH > m.clientH + 1 || m.sw > m.cw + 1) {
      wrapped = true;
      console.log(`WRAP DETECTED on pill ${i}:`, JSON.stringify(m));
    }
  }
  console.log(wrapped ? "FAIL: pill content wraps" : "PASS: no pill wraps (auto-width)");

  // Screenshot 1: left end of the pill row
  await pills.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOT}/book-pills-start.png` });

  // Screenshot 2: full scrollable range — scroll the pill row to the end
  const row = pills.first().locator("xpath=..");
  const scrollW = await row.evaluate((el) => el.scrollWidth);
  await row.evaluate((el) => el.scrollTo(el.scrollWidth, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/book-pills-end.png` });
  console.log(`pill row scrollWidth: ${scrollW}px (viewport ~1440 → horizontal scroll active)`);

  // Full-page screenshot for context
  await page.screenshot({ path: `${SHOT}/book-pills-full.png`, fullPage: true });

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
