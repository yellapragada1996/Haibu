const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const EMAIL = "fan@haibu.test", PASS = "haibu123";
(async () => {
  const b = await chromium.launch();
  // Case A: browse page
  {
    const p = await (await b.newContext()).newPage();
    await p.goto(`${BASE}/browse?available=today`);
    await p.waitForLoadState("networkidle");
    await p.click('a[href*="/login"]:has-text("Log in")');
    await p.waitForURL(u => u.pathname.startsWith("/login"), { timeout: 10000 });
    const url = p.url();
    await p.fill('input[type="email"]', EMAIL);
    await p.fill('input[type="password"]', PASS);
    await p.click('button[type="submit"]');
    await p.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 15000 });
    const f = p.url();
    console.log("A /browse?available=today ->", f, "=>", f.includes("/browse") && !f.includes("/dashboard") ? "PASS" : "FAIL");
    await p.context().close();
  }
  // Case B: already logged in, visits /login?redirect=... directly -> should skip form
  {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.waitForLoadState("networkidle");
    await p.fill('input[type="email"]', EMAIL);
    await p.fill('input[type="password"]', PASS);
    await p.click('button[type="submit"]');
    await p.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 15000 });
    // logged in; now simulate middleware redirect target by visiting /login?redirect=/search
    await p.goto(`${BASE}/login?redirect=${encodeURIComponent("/search")}`);
    await p.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 15000 });
    const f = p.url();
    console.log("B already-logged-in /login?redirect=/search ->", f, "=>", f.includes("/search") && !f.includes("/dashboard") ? "PASS" : "FAIL");
    await ctx.close();
  }
  await b.close();
})();
