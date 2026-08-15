// Step 12 end-to-end verification (real app + real DB, no mocks).
// Exercises: review submission → creator-profile display, report row,
// block row (fan→creator), blocked reservation guard (both directions).

const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const crypto = require("crypto");

const BASE = "http://localhost:3000";
const FAN_ID = "0d719919-6565-4063-8de2-772f63e25125"; // fan@haibu.test (Elizabeth)
const CREATOR_PROFILE_ID = "073c016e-db44-460f-9c32-824ec9c7d367"; // creator@haibu.test (Queen)
const CREATOR_USER_ID = "f0660cc5-f7b2-439b-a61a-83bdbfd0a071";
const OFFERING_ID = "8c1410e0-eddb-423d-86c8-c409a9f4ed87"; // Piano Lessons (30 min)
const SHOTS = "/Users/raghavendra/Documents/Projects/Haibu/test-screenshots";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();

  const bookingId = crypto.randomUUID();

  // Defensive cleanup of any prior run's rows for this pair/booking.
  await db.query("DELETE FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)", [FAN_ID, CREATOR_USER_ID]);
  await db.query("DELETE FROM reports WHERE booking_id = $1", [bookingId]);
  await db.query("DELETE FROM reviews WHERE booking_id = $1", [bookingId]);
  await db.query("DELETE FROM bookings WHERE id = $1", [bookingId]);

  const start = new Date(Date.now() - 2 * 86400000);
  const end = new Date(start.getTime() + 30 * 60000);
  await db.query(
    `INSERT INTO bookings (id, fan_id, creator_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents)
     VALUES ($1, $2, $3, $4, 'completed', $5, $6, 4000, 720, 3280)`,
    [bookingId, FAN_ID, CREATOR_PROFILE_ID, OFFERING_ID, start.toISOString(), end.toISOString()],
  );
  console.log("Created completed test booking:", bookingId);

  const browser = await chromium.launch();
  try {
    // ---------- FAN session ----------
    const fanCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const fan = await fanCtx.newPage();
    await fan.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await fan.fill('input[type="email"]', "fan@haibu.test");
    await fan.fill('input[type="password"]', "haibu123");
    await fan.click('button[type="submit"]');
    await fan.waitForTimeout(2500);

    // 1. Review form visible on the completed booking detail page
    await fan.goto(`${BASE}/bookings/${bookingId}`, { waitUntil: "networkidle" });
    await fan.waitForSelector("text=Leave a review", { timeout: 15000 });
    await fan.screenshot({ path: `${SHOTS}/step12-review-form.png` });
    console.log("[1] Review form rendered on completed booking (fan)");

    // 2. Submit a 5-star review with text
    await fan.getByRole("button", { name: "5 stars" }).click();
    await fan.getByPlaceholder("Optional — anything you'd like to share?").fill("Lovely session, very relaxing.");
    await fan.getByRole("button", { name: "Submit review" }).click();
    await sleep(1500); // allow server action + router.refresh

    const review = await db.query(
      "SELECT rating, text, creator_id FROM reviews WHERE booking_id = $1",
      [bookingId],
    );
    console.log("[2] reviews row:", JSON.stringify(review.rows[0]));
    if (!(review.rows[0]?.rating === 5 && review.rows[0]?.text === "Lovely session, very relaxing.")) {
      throw new Error("Review row did not match expected values");
    }

    // 3. Review displays on the public creator profile
    await fan.goto(`${BASE}/creators/${CREATOR_PROFILE_ID}`, { waitUntil: "networkidle" });
    await fan.waitForSelector("text=Lovely session, very relaxing.", { timeout: 15000 });
    await fan.screenshot({ path: `${SHOTS}/step12-profile-review.png` });
    console.log("[3] Review visible on creator profile page");

    // 4. Report via booking detail page
    await fan.goto(`${BASE}/bookings/${bookingId}`, { waitUntil: "networkidle" });
    await fan.getByRole("button", { name: "Report", exact: true }).click();
    await fan.getByPlaceholder("Describe the issue").fill("test report — please ignore");
    await fan.getByRole("button", { name: "Submit report" }).click();
    await sleep(1500);
    const report = await db.query(
      "SELECT reporter_id, reported_user_id, booking_id, reason, status FROM reports WHERE booking_id = $1",
      [bookingId],
    );
    console.log("[4] reports row:", JSON.stringify(report.rows[0]));
    if (!(report.rows[0]?.reported_user_id === CREATOR_USER_ID && report.rows[0]?.reason === "test report — please ignore")) {
      throw new Error("Report row did not match expected values");
    }

    // 5. Block creator (fan → creator) via booking detail page
    await fan.getByRole("button", { name: "Block Queen", exact: true }).click();
    await fan.getByRole("button", { name: "Block", exact: true }).click();
    await sleep(1500);
    const block = await db.query(
      "SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = $1 AND blocked_id = $2",
      [FAN_ID, CREATOR_USER_ID],
    );
    console.log("[5] blocks row (fan→creator):", JSON.stringify(block.rows[0]));
    if (!block.rows[0]) throw new Error("Block row (fan→creator) missing");
    await fan.waitForSelector("text=Queen is blocked.", { timeout: 15000 });

    // 6. Blocked pair cannot complete a reservation (blocker side)
    await fan.goto(`${BASE}/book/${CREATOR_PROFILE_ID}?offering=${OFFERING_ID}`, { waitUntil: "networkidle" });
    await fan.waitForSelector("div.grid.grid-cols-2 > button", { timeout: 20000 });
    await fan.locator("div.grid.grid-cols-2 > button").first().click();
    await fan.waitForSelector("text=You can't book a session with this creator.", { timeout: 15000 });
    await fan.screenshot({ path: `${SHOTS}/step12-blocked-reservation.png` });
    console.log("[6] Blocked reservation rejected (fan blocked creator)");

    // 7. Reverse direction: creator blocks fan, fan still cannot book
    await db.query("DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2", [FAN_ID, CREATOR_USER_ID]);
    await db.query(
      "INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)",
      [CREATOR_USER_ID, FAN_ID],
    );
    const reverse = await db.query(
      "SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = $1 AND blocked_id = $2",
      [CREATOR_USER_ID, FAN_ID],
    );
    console.log("[7a] blocks row (creator→fan):", JSON.stringify(reverse.rows[0]));

    await fan.goto(`${BASE}/book/${CREATOR_PROFILE_ID}?offering=${OFFERING_ID}`, { waitUntil: "networkidle" });
    await fan.waitForSelector("div.grid.grid-cols-2 > button", { timeout: 20000 });
    await fan.locator("div.grid.grid-cols-2 > button").first().click();
    await fan.waitForSelector("text=You can't book a session with this creator.", { timeout: 15000 });
    console.log("[7b] Blocked reservation rejected (creator blocked fan)");

    await fanCtx.close();
    console.log("ALL CHECKS PASSED");
  } finally {
    // Cleanup (order matters: reviews FK-restrict on booking, then booking)
    await db.query("DELETE FROM reviews WHERE booking_id = $1", [bookingId]);
    await db.query("DELETE FROM reports WHERE booking_id = $1", [bookingId]);
    await db.query("DELETE FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)", [FAN_ID, CREATOR_USER_ID]);
    await db.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
    await db.end();
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
