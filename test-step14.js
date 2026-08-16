// Review & rating UX (dashboard tabs + review modals) end-to-end.
// Exercises: dashboard Upcoming/Past tab switching, review-form modal (submit
// -> held), read-only review modal, creator mutual publish, profile display,
// and 7-day window expiry. Pixel-decodes modal screenshots (no image viewing).

const { chromium } = require("playwright");
const { Client } = require("pg");
const sharp = require("sharp");
const fs = require("fs");
const crypto = require("crypto");

const BASE = "http://localhost:3000";
const FAN_ID = "0d719919-6565-4063-8de2-772f63e25125"; // fan@haibu.test (Elizabeth)
const CREATOR_USER_ID = "f0660cc5-f7b2-439b-a61a-83bdbfd0a071"; // creator@haibu.test (Queen)
const CREATOR_PROFILE_ID = "073c016e-db44-460f-9c32-824ec9c7d367";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "haibu123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

async function insertOffering(db, title) {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO offerings (id, creator_id, title, category, duration_minutes, price_cents, is_active) VALUES ($1,$2,$3,'music',30,2500,true)`,
    [id, CREATOR_PROFILE_ID, title],
  );
  return id;
}

async function insertBooking(db, offeringId, { status, endOffsetMs }) {
  const id = crypto.randomUUID();
  const start = new Date(Date.now() + endOffsetMs - 30 * 60000);
  const end = new Date(Date.now() + endOffsetMs);
  const joined = new Date(start.getTime() + 2 * 60000);
  await db.query(
    `INSERT INTO bookings (id, fan_id, creator_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, fan_joined_at, creator_joined_at, payout_eligible_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,2500,450,2050,$8,$8,$9)`,
    [id, FAN_ID, CREATOR_PROFILE_ID, offeringId, status, start.toISOString(), end.toISOString(), joined.toISOString(), new Date(start.getTime() + 72 * 3600000).toISOString()],
  );
  return id;
}

async function pixelCheck(page, path, label) {
  const buf = await page.screenshot();
  await fs.promises.writeFile(path, buf);
  const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let golden = 0;
  let modalBg = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Golden/amber stars (~#fbbf24 = rgb 251,191,36), tolerant of anti-aliasing.
    if (r > 200 && g > 150 && g < 220 && b < 100) golden++;
    if (r === 26 && g === 26 && b === 26) modalBg++; // #1A1A1A modal panel
  }
  console.log(`[pixels ${label}] golden: ${golden} | modalBg(#1A1A1A): ${modalBg}`);
  return { golden, modalBg };
}

async function main() {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();

  const offeringA = await insertOffering(db, "Review Test Alpha");
  const offeringB = await insertOffering(db, "Review Test Beta");
  const offeringC = await insertOffering(db, "Review Test Gamma");
  const A = await insertBooking(db, offeringA, { status: "completed", endOffsetMs: -1 * 86400000 }); // 1 day ago
  const B = await insertBooking(db, offeringB, { status: "completed", endOffsetMs: -8 * 86400000 }); // 8 days ago
  const C = await insertBooking(db, offeringC, { status: "confirmed", endOffsetMs: 2 * 86400000 }); // future

  const browser = await chromium.launch();
  try {
    const fanCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const fan = await fanCtx.newPage();
    await login(fan, "fan@haibu.test");

    // ---------- 1. dashboard tab switching ----------
    await fan.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await fan.waitForSelector("text=Dashboard", { timeout: 15000 });

    // Default "Upcoming" tab: future booking visible, completed hidden.
    const upAlpha = await fan.locator("text=Review Test Alpha").count();
    const upGamma = await fan.locator("text=Review Test Gamma").count();
    console.log("[1] Upcoming tab: alpha(past) visible:", upAlpha, "| gamma(upcoming) visible:", upGamma);
    if (!(upGamma > 0 && upAlpha === 0)) throw new Error("Upcoming tab shows wrong sessions");

    // Switch to Past: completed visible, future hidden.
    await fan.getByRole("button", { name: "Past", exact: true }).click();
    await fan.waitForTimeout(500);
    const pastAlpha = await fan.locator("text=Review Test Alpha").count();
    const pastGamma = await fan.locator("text=Review Test Gamma").count();
    const expiredBeta = await fan.locator("div.rounded-card").filter({ hasText: "Review Test Beta" }).locator("text=Review period expired").count();
    const awaiting = await fan.locator("text=awaiting review").count();
    console.log("[1] Past tab: alpha visible:", pastAlpha, "| gamma visible:", pastGamma, "| beta 'Review period expired':", expiredBeta, "| awaiting cue:", awaiting);
    if (!(pastAlpha > 0 && pastGamma === 0 && expiredBeta > 0 && awaiting > 0)) throw new Error("Past tab shows wrong sessions");

    // ---------- 2. review form modal ----------
    const aCard = fan.locator("div.rounded-card").filter({ hasText: "Review Test Alpha" });
    await aCard.click();
    await fan.waitForSelector("text=Leave a review", { timeout: 5000 });
    await fan.getByRole("button", { name: "5 stars" }).click();
    await fan.getByPlaceholder("How was your session?").fill("Great lesson, very helpful.");
    const formPixels = await pixelCheck(fan, "/tmp/step14-review-modal.png", "review-form-modal");
    if (formPixels.golden < 30) throw new Error("Golden stars not rendered in review modal");

    await fan.getByRole("button", { name: "Submit review" }).click();
    await sleep(1500);

    const guestRev = await db.query(
      `SELECT is_public, rating, text, tags FROM reviews WHERE booking_id = $1 AND reviewer_role = 'guest'`,
      [A],
    );
    console.log("[2] guest review (held):", JSON.stringify(guestRev.rows[0]));
    if (!(guestRev.rows[0]?.is_public === false && guestRev.rows[0]?.rating === 5)) {
      throw new Error("Guest review not held correctly");
    }

    // Modal closed, underlying list intact.
    const stillPastAlpha = await fan.locator("text=Review Test Alpha").count();
    console.log("[2] list intact after modal close:", stillPastAlpha > 0);
    if (stillPastAlpha === 0) throw new Error("List broke after modal close");

    // ---------- 3. read-only review modal ----------
    // Refresh to pick up the new review state.
    await fan.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await fan.getByRole("button", { name: "Past", exact: true }).click();
    await fan.waitForTimeout(500);
    const reviewedCard = fan.locator("div.rounded-card").filter({ hasText: "Review Test Alpha" });
    const rateGone = await reviewedCard.getByText("Rate", { exact: true }).count();
    const rowStars = await reviewedCard.locator("text=★★★★★").count();
    console.log("[3] 'Rate' hint gone:", rateGone === 0, "| reviewed row shows 5 stars:", rowStars > 0);
    if (rateGone !== 0) throw new Error("Rate hint should be gone after review");
    if (rowStars === 0) throw new Error("Reviewed row should show the star rating");

    await reviewedCard.click();
    await fan.waitForSelector("text=Your review", { timeout: 5000 });
    const roText = await fan.locator("text=Great lesson, very helpful.").count();
    const roPixels = await pixelCheck(fan, "/tmp/step14-readonly-modal.png", "read-only-modal");
    console.log("[3] read-only modal shows text:", roText > 0);
    if (roText === 0) throw new Error("Read-only modal missing review content");
    if (roPixels.golden < 10) throw new Error("Read-only modal stars not golden");

    // ---------- 4. creator mutual publish ----------
    const creatorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const creator = await creatorCtx.newPage();
    await login(creator, "creator@haibu.test");
    await creator.goto(`${BASE}/creator/bookings`, { waitUntil: "networkidle" });
    const cCard = creator.locator("div.rounded-card").filter({ hasText: "Review Test Alpha" });
    await cCard.getByRole("button", { name: "Review this guest" }).click();
    await creator.getByRole("button", { name: "Thumbs up" }).click();
    await creator.getByRole("button", { name: "Submit review" }).click();
    await sleep(1500);
    const guestAfter = await db.query(`SELECT is_public FROM reviews WHERE booking_id = $1 AND reviewer_role = 'guest'`, [A]);
    console.log("[4] guest review published after mutual:", guestAfter.rows[0]?.is_public);
    if (guestAfter.rows[0]?.is_public !== true) throw new Error("Mutual publish failed");

    // ---------- 5. profile shows public review ----------
    await fan.goto(`${BASE}/creators/${CREATOR_PROFILE_ID}`, { waitUntil: "networkidle" });
    await fan.waitForSelector("text=Great lesson, very helpful.", { timeout: 15000 });
    const firstInitial = await fan.locator("text=Elizabeth").count();
    const newCreator = await fan.locator("text=New creator").count();
    console.log("[5] profile: first name:", firstInitial > 0, "| New creator guard:", newCreator > 0);
    if (!(firstInitial > 0 && newCreator > 0)) throw new Error("Profile review display wrong");

    await creatorCtx.close();
    await fanCtx.close();
    console.log("ALL CHECKS PASSED");
  } finally {
    await db.query("DELETE FROM reviews WHERE booking_id IN ($1,$2,$3)", [A, B, C]);
    await db.query("DELETE FROM bookings WHERE id IN ($1,$2,$3)", [A, B, C]);
    await db.query("DELETE FROM offerings WHERE id IN ($1,$2,$3)", [offeringA, offeringB, offeringC]);
    await db.end();
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
