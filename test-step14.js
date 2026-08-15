// Review & rating system end-to-end (real app + real DB, no mocks).
// Exercises: session history entry point, guest review submit (held = not
// public), creator review submit (mutual publish), profile public display
// (first name + initial, tags, tag summary, "New creator" guard), and the
// 7-day review window expiry.

const { chromium } = require("playwright");
const { Client } = require("pg");
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

async function insertCompleted(db, offeringId, endOffsetMs) {
  const id = crypto.randomUUID();
  const start = new Date(Date.now() + endOffsetMs - 30 * 60000);
  const end = new Date(Date.now() + endOffsetMs);
  const joined = new Date(start.getTime() + 2 * 60000);
  await db.query(
    `INSERT INTO bookings (id, fan_id, creator_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, fan_joined_at, creator_joined_at, payout_eligible_at)
     VALUES ($1,$2,$3,$4,'completed',$5,$6,2500,450,2050,$7,$7,$8)`,
    [id, FAN_ID, CREATOR_PROFILE_ID, offeringId, start.toISOString(), end.toISOString(), joined.toISOString(), new Date(start.getTime() + 72 * 3600000).toISOString()],
  );
  return id;
}

async function main() {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();

  const offeringA = await insertOffering(db, "Review Test Alpha");
  const offeringB = await insertOffering(db, "Review Test Beta");
  const A = await insertCompleted(db, offeringA, -1 * 86400000); // ended 1 day ago
  const B = await insertCompleted(db, offeringB, -8 * 86400000); // ended 8 days ago

  const browser = await chromium.launch();
  try {
    // ---------- 1. session history: Review pill + expired state ----------
    const fanCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const fan = await fanCtx.newPage();
    await login(fan, "fan@haibu.test");
    await fan.goto(`${BASE}/bookings`, { waitUntil: "networkidle" });
    await fan.waitForSelector("text=My sessions", { timeout: 15000 });

    const reviewPill = fan.locator(`a[href="/bookings/${A}"]`).filter({ hasText: "Review" });
    const expiredRow = fan.locator("div.rounded-card").filter({ hasText: "Review Test Beta" });
    console.log("[1] Review pill present:", (await reviewPill.count()) > 0);
    console.log("[1] 'Review period expired' present:", (await expiredRow.locator("text=Review period expired").count()) > 0);
    if ((await reviewPill.count()) === 0) throw new Error("Review pill missing");
    if ((await expiredRow.locator("text=Review period expired").count()) === 0) throw new Error("Expired state missing");

    // ---------- 2. guest submits review (held = not public) ----------
    await fan.goto(`${BASE}/bookings/${A}`, { waitUntil: "networkidle" });
    await fan.getByRole("button", { name: "5 stars" }).click();
    await fan.getByPlaceholder("How was the lesson? What would you tell someone considering booking?").fill("Great lesson, very helpful.");
    await fan.getByRole("button", { name: "Clear explanations" }).click();
    await fan.getByRole("button", { name: "Patient teacher" }).click();
    await fan.getByRole("button", { name: "Submit review" }).click();
    await sleep(1500);

    const guestRev = await db.query(
      `SELECT reviewer_role, is_public, rating, text, tags FROM reviews WHERE booking_id = $1 AND reviewer_role = 'guest'`,
      [A],
    );
    console.log("[2] guest review:", JSON.stringify(guestRev.rows[0]));
    if (!(guestRev.rows[0]?.is_public === false && guestRev.rows[0]?.rating === 5 && guestRev.rows[0]?.reviewer_role === "guest")) {
      throw new Error("Guest review not held correctly");
    }
    if (!(Array.isArray(guestRev.rows[0].tags) && guestRev.rows[0].tags.includes("Clear explanations"))) {
      throw new Error("Reaction tags not persisted");
    }

    // Held review should NOT appear on the public profile yet.
    await fan.goto(`${BASE}/creators/${CREATOR_PROFILE_ID}`, { waitUntil: "networkidle" });
    const heldVisible = await fan.locator("text=Great lesson, very helpful.").count();
    console.log("[2] held review visible on profile (should be 0):", heldVisible);
    if (heldVisible !== 0) throw new Error("Held review leaked to public profile");

    // ---------- 3. creator submits review -> mutual publish ----------
    const creatorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const creator = await creatorCtx.newPage();
    await login(creator, "creator@haibu.test");
    await creator.goto(`${BASE}/creator/bookings`, { waitUntil: "networkidle" });

    const aRow = creator.locator("div.rounded-card").filter({ hasText: "Review Test Alpha" });
    await aRow.getByRole("button", { name: "Review this guest" }).click();
    await creator.getByRole("button", { name: "Thumbs up" }).click();
    await creator.getByRole("button", { name: "Submit review" }).click();
    await sleep(1500);

    const creatorRev = await db.query(
      `SELECT reviewer_role, is_public, creator_sentiment FROM reviews WHERE booking_id = $1 AND reviewer_role = 'creator'`,
      [A],
    );
    const guestAfterMutual = await db.query(
      `SELECT is_public, published_at FROM reviews WHERE booking_id = $1 AND reviewer_role = 'guest'`,
      [A],
    );
    console.log("[3] creator review:", JSON.stringify(creatorRev.rows[0]));
    console.log("[3] guest review after mutual:", JSON.stringify(guestAfterMutual.rows[0]));
    if (!(creatorRev.rows[0]?.reviewer_role === "creator" && creatorRev.rows[0]?.is_public === false && creatorRev.rows[0]?.creator_sentiment === "positive")) {
      throw new Error("Creator review not recorded correctly");
    }
    if (!(guestAfterMutual.rows[0]?.is_public === true)) {
      throw new Error("Mutual submission did not publish the guest review");
    }

    // ---------- 4. public profile now shows it ----------
    await fan.goto(`${BASE}/creators/${CREATOR_PROFILE_ID}`, { waitUntil: "networkidle" });
    await fan.waitForSelector("text=Great lesson, very helpful.", { timeout: 15000 });
    const firstName = await fan.locator("text=Elizabeth").count();
    const tagSummary = await fan.locator("text=Clear explanations (1)").count();
    const newCreator = await fan.locator("text=New creator").count();
    console.log("[4] profile: guest first name:", firstName > 0, "| tag summary:", tagSummary > 0, "| New creator guard:", newCreator > 0);
    if (!(firstName > 0 && tagSummary > 0 && newCreator > 0)) {
      throw new Error("Public profile review display is wrong");
    }

    await creatorCtx.close();
    await fanCtx.close();
    console.log("ALL CHECKS PASSED");
  } finally {
    await db.query("DELETE FROM reviews WHERE booking_id IN ($1,$2)", [A, B]);
    await db.query("DELETE FROM bookings WHERE id IN ($1,$2)", [A, B]);
    await db.query("DELETE FROM offerings WHERE id IN ($1,$2)", [offeringA, offeringB]);
    await db.end();
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
