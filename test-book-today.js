// Verify a today slot (past 60-min lead) reserves without error after the fix.
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const EMAIL = "fan@haibu.test", PASS = "haibu123";
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  // login
  await p.goto(`${BASE}/login`);
  await p.waitForLoadState("networkidle");
  await p.fill('input[type="email"]', EMAIL);
  await p.fill('input[type="password"]', PASS);
  await p.click('button[type="submit"]');
  await p.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 15000 });
  // book page for cleo-muse, slot 22:30 UTC today (63+ min out)
  const slot = encodeURIComponent("2026-08-17T22:30:00.000Z");
  await p.goto(`${BASE}/book/e4e97661-3ce2-4034-b445-b2ed18d84bd9?offering=f8c92864-8109-44d8-9c18-7e6421bd1a6c&slot=${slot}`);
  await p.waitForLoadState("networkidle");
  // auto-reserve may take a moment
  let payBtn = false, errText = null;
  try {
    await p.waitForSelector('button:has-text("Pay")', { timeout: 15000 });
    payBtn = true;
  } catch {}
  const body = await p.textContent("body");
  for (const t of ["Something went wrong.", "That time is no longer available", "Slot just taken"]) {
    if (body.includes(t)) errText = t;
  }
  console.log("Pay button visible:", payBtn, "| error:", errText ?? "none");
  console.log(payBtn && !errText ? "PASS: today slot reserves fine" : "FAIL");
  await b.close();
  process.exit(payBtn && !errText ? 0 : 1);
})();
