// Verify login redirect: logged-out user on /@queen clicks "Log in",
// authenticates, and must land back on /@queen (not /dashboard).
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const EMAIL = "fan@haibu.test";
const PASS = "haibu123";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 1. Log out first (fresh context has no session, but be thorough)
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");

  // 2. Go to a public creator page (queen)
  await page.goto(`${BASE}/@queen`);
  await page.waitForLoadState("networkidle");
  const onQueenBefore = page.url().includes("/@queen");
  console.log("on /@queen before login:", onQueenBefore);

  // 3. Click "Log in" in the navbar — it should carry ?redirect=%2F%40queen
  await page.click('a[href*="/login"]:has-text("Log in")');
  await page.waitForURL((url) => url.pathname.startsWith("/login"), {
    timeout: 10000,
  });
  await page.waitForLoadState("networkidle");
  const loginUrl = page.url();
  console.log("login URL:", loginUrl);
  if (!loginUrl.includes("redirect=")) {
    console.log("FAIL: login URL has no ?redirect=");
    await browser.close();
    process.exit(1);
  }

  // 4. Fill in email + password and submit
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');

  // 5. Wait for navigation away from /login
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15000,
  }).catch(() => {});
  await page.waitForLoadState("networkidle");

  const finalUrl = page.url();
  console.log("FINAL URL:", finalUrl);
  const onQueen = finalUrl.includes("/@queen");
  const onDashboard = finalUrl.includes("/dashboard");

  // Also verify we're actually authenticated (navbar should show logout/profile)
  const body = await page.textContent("body");
  const loggedIn = body.includes("Log out") || body.includes("Become a Creator") || body.includes("Profile");

  console.log("on /@queen after login:", onQueen);
  console.log("on /dashboard after login:", onDashboard);
  console.log("authenticated UI visible:", loggedIn);

  if (onQueen && !onDashboard && loggedIn) {
    console.log("PASS: logged-in user returned to /@queen");
    await browser.close();
    process.exit(0);
  }
  console.log("FAIL: login redirect did not return user to /@queen");
  await browser.close();
  process.exit(1);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
