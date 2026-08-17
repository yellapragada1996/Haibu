const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const iso = encodeURIComponent(new Date(Date.now() + 3600e3).toISOString());
  await p.goto(`${BASE}/book/073c016e-db44-460f-9c32-824ec9c7d367?offering=80805ae7-639c-4d9c-b57b-b0c4cb77c41d&slot=${iso}`);
  await p.waitForURL(u => u.pathname.startsWith("/login"), { timeout: 10000 });
  const u = p.url();
  const preserved = u.includes("redirect=%2Fbook%2F") && u.includes("offering") && u.includes("slot");
  console.log("logged-out /book/<id>?offering=..&slot=.. ->", u);
  console.log(preserved ? "PASS: middleware redirects with full path+query" : "FAIL");
  await b.close();
  process.exit(preserved ? 0 : 1);
})();
