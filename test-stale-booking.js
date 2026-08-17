// Verify: stale pendingBooking must not show "Almost there" when clicking
// "Log in" outside a booking flow; genuine booking flow still shows the card;
// /book is protected by middleware with full path+query preserved.
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();

  // ---- Part A: real flow through slot picker -> Continue -> /login shows card
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/@queen`);
    await p.waitForLoadState("networkidle");
    const bookBtn = await p.$('a[href^="/slot/"]');
    if (!bookBtn) {
      console.log("A SKIP: no Book button on /@queen");
      await ctx.close();
    } else {
      await bookBtn.click();
      await p.waitForURL((u) => u.pathname.startsWith("/slot/"), { timeout: 10000 });
      await p.waitForLoadState("networkidle");
      const slotUrl = p.url();
      const timeBtn = await p.$('button[aria-pressed="false"][aria-label]');
      if (!timeBtn) {
        console.log("A SKIP: no time slots for queen today");
        await ctx.close();
      } else {
        await timeBtn.click();
        await p.click('button:has-text("Continue")');
        await p.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 10000 });
        // The mount effect reads sessionStorage asynchronously — wait for it.
        let cardShown = false;
        try {
          await p.waitForFunction(() => document.body.textContent.includes("Almost there"), null, { timeout: 8000 });
          cardShown = true;
        } catch { /* not shown */ }
        console.log("A genuine booking flow -> card shown:", cardShown, "| url:", p.url());
        console.log(cardShown ? "A PASS" : "A FAIL");
        if (!cardShown) await browser.close(), process.exit(1);

        // ---- Part B: now go to a creator page and click "Log in" (navbar)
        await p.goto(`${BASE}/@queen`);
        await p.waitForLoadState("networkidle");
        await p.click('a[href*="/login"]:has-text("Log in")');
        await p.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 10000 });
        await p.waitForLoadState("networkidle");
        const body2 = await p.textContent("body");
        const staleCard = body2.includes("Almost there");
        const normalForm = (await p.$('input[type="email"]')) !== null;
        console.log("B navbar login after abandoned flow -> stale card shown:", staleCard, "| normal form:", normalForm);
        console.log(!staleCard && normalForm ? "B PASS" : "B FAIL");

        // ---- Part C: middleware protects /book preserving path+query
        await ctx.clearCookies();
        const m = slotUrl.match(/\/slot\/([^?]+)\?offering=([^&]+)/);
        if (m) {
          const [_, cid, oid] = m;
          const iso = new Date(Date.now() + 3600e3).toISOString();
          const bookUrl = `/book/${cid}?offering=${oid}&slot=${encodeURIComponent(iso)}`;
          await p.goto(`${BASE}${bookUrl}`);
          await p.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 10000 });
          const u = p.url();
          const preserved = u.includes("redirect=%2Fbook%2F") && u.includes("offering");
          console.log("C /book logged-out ->", u, "| redirect preserved:", preserved);
          console.log(preserved ? "C PASS" : "C FAIL");
        }
        await ctx.close();
      }
    }
  }

  // ---- Part D: direct stale-injection check (deterministic)
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.evaluate(() => {
      sessionStorage.setItem("pendingBooking", JSON.stringify({
        creatorId: "00000000-0000-0000-0000-000000000000",
        creatorName: "Stale Creator", avatarUrl: null,
        offeringId: "x", offeringTitle: "Test", durationMinutes: 30,
        slotStart: new Date(Date.now() + 3600e3).toISOString(),
        priceCents: 2000, displayDate: "Today", displayTime: "9:00 AM",
      }));
    });
    // not a booking redirect -> card must NOT show
    await p.goto(`${BASE}/login?redirect=${encodeURIComponent("/@queen")}`);
    await p.waitForLoadState("networkidle");
    const b1 = await p.textContent("body");
    const d1 = b1.includes("Almost there") ? "SHOWN (FAIL)" : "hidden (PASS)";
    console.log("D1 stale booking + navbar login -> card:", d1);
    // booking redirect -> card must show (re-inject: D1's effect cleared it)
    await p.evaluate(() => {
      sessionStorage.setItem("pendingBooking", JSON.stringify({
        creatorId: "00000000-0000-0000-0000-000000000000",
        creatorName: "Stale Creator", avatarUrl: null,
        offeringId: "x", offeringTitle: "Test", durationMinutes: 30,
        slotStart: new Date(Date.now() + 3600e3).toISOString(),
        priceCents: 2000, displayDate: "Today", displayTime: "9:00 AM",
      }));
    });
    await p.goto(`${BASE}/login?redirect=${encodeURIComponent("/book/abc?offering=x&slot=y")}`);
    await p.waitForLoadState("networkidle");
    let d2Shown = false;
    try {
      await p.waitForFunction(() => document.body.textContent.includes("Almost there"), null, { timeout: 8000 });
      d2Shown = true;
    } catch { /* not shown */ }
    const d2 = d2Shown ? "shown (PASS)" : "HIDDEN (FAIL)";
    console.log("D2 pendingBooking + booking redirect -> card:", d2);
    await ctx.close();
  }

  await browser.close();
  console.log("done");
  process.exit(0);
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
