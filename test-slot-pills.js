const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

  await page.goto("http://localhost:3000/login");
  await page.fill("input[type=email]", "fan@haibu.test");
  await page.fill("input[type=password]", "haibu123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 10000 });

  await page.goto("http://localhost:3000/book/073c016e-db44-460f-9c32-824ec9c7d367?offering=5c9a52d1-4b32-4c25-8acb-a4da28792d35");
  await page.waitForSelector("text=Available times", { timeout: 10000 });
  await page.waitForTimeout(2000);

  async function countTimeSlots() {
    const buttons = await page.$$("button");
    let n = 0;
    for (const b of buttons) {
      const t = (await b.textContent())?.trim() ?? "";
      if (/^\d{1,2}:\d{2}\s?(AM|PM)$/.test(t)) n++;
    }
    return n;
  }

  console.log("Default day slots:", await countTimeSlots());

  // Click "Thu, Aug 13" pill
  await page.click("button:has-text('Thu, Aug 13')");
  await page.waitForTimeout(1000);
  console.log("After Thu Aug 13:", await countTimeSlots());

  // Click "Mon, Aug 17"
  await page.click("button:has-text('Mon, Aug 17')");
  await page.waitForTimeout(1000);
  console.log("After Mon Aug 17:", await countTimeSlots());

  // Screenshot of a later date
  await page.screenshot({ path: "/tmp/slot-ux-2.png", fullPage: true });
  console.log("Screenshot: /tmp/slot-ux-2.png");

  await browser.close();
}
main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
