// Step 13 no-show override end-to-end verification (real app + real DB).
// Exercises: no_show_fan -> completed, no_show_fan -> cancelled_admin (refund),
// admin_actions audit row for each, and rejection of no_show_creator /
// cancelled_creator with the "not supported" message.
//
// NOTE: refund's Stripe branch is exercised in the null-payment-intent case
// (dev DB has no booking with a real Stripe PaymentIntent); it mirrors
// actions/cancel.ts and adminForceCancel.

const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const crypto = require("crypto");

const BASE = "http://localhost:3000";
const FAN_ID = "0d719919-6565-4063-8de2-772f63e25125"; // fan@haibu.test
const CREATOR_USER_ID = "f0660cc5-f7b2-439b-a61a-83bdbfd0a071"; // creator@haibu.test
const CREATOR_PROFILE_ID = "073c016e-db44-460f-9c32-824ec9c7d367";
const OFFERING_ID = "8c1410e0-eddb-423d-86c8-c409a9f4ed87"; // Piano Lessons

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

async function insertBooking(db, status) {
  const id = crypto.randomUUID();
  const start = new Date(Date.now() + 10 * 86400000);
  const end = new Date(start.getTime() + 30 * 60000);
  const creatorJoined = status === "no_show_fan" ? new Date() : null;
  const fanJoined = status === "no_show_creator" ? new Date() : null;
  await db.query(
    `INSERT INTO bookings (id, fan_id, creator_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents, fan_joined_at, creator_joined_at, payout_eligible_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 4000, 720, 3280, $8, $9, $10)`,
    [
      id,
      FAN_ID,
      CREATOR_PROFILE_ID,
      OFFERING_ID,
      status,
      start.toISOString(),
      end.toISOString(),
      fanJoined ? fanJoined.toISOString() : null,
      creatorJoined ? creatorJoined.toISOString() : null,
      new Date(Date.now() + 72 * 3600000).toISOString(),
    ],
  );
  return id;
}

async function main() {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();

  const origAdmin = await db.query(
    "SELECT role_admin FROM users WHERE id = $1",
    [CREATOR_USER_ID],
  );
  await db.query("UPDATE users SET role_admin = true WHERE id = $1", [CREATOR_USER_ID]);

  // A: -> completed, B: -> refund, C/D: rejection (flipped to the target state)
  const A = await insertBooking(db, "no_show_fan");
  const B = await insertBooking(db, "no_show_fan");
  const C = await insertBooking(db, "no_show_fan");
  const D = await insertBooking(db, "no_show_fan");

  const browser = await chromium.launch();
  try {
    const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const admin = await adminCtx.newPage();
    await login(admin, "creator@haibu.test");
    await admin.goto(`${BASE}/admin/bookings`, { waitUntil: "networkidle" });
    await admin.waitForSelector("text=Bookings", { timeout: 15000 });

    // ---------- 1. no_show_fan -> completed ----------
    let row = admin.locator("tr").filter({ hasText: A.slice(0, 8) });
    await row.getByRole("button", { name: "Override" }).click();
    await admin.getByPlaceholder("Required reason").fill("fan actually attended — telemetry missed it");
    await admin.getByRole("button", { name: "Confirm override" }).click();
    await sleep(1500);
    const a = await db.query("SELECT status, payout_eligible_at FROM bookings WHERE id = $1", [A]);
    const aAudit = await db.query(
      "SELECT action, details, reason, admin_id FROM admin_actions WHERE booking_id = $1",
      [A],
    );
    console.log("[1] booking A status:", a.rows[0]?.status, "| payout_eligible_at set:", a.rows[0]?.payout_eligible_at != null);
    console.log("[1] admin_actions A:", JSON.stringify(aAudit.rows[0]));
    if (!(a.rows[0]?.status === "completed" && a.rows[0]?.payout_eligible_at != null)) {
      throw new Error("no_show_fan -> completed did not persist correctly");
    }
    if (!(aAudit.rows[0]?.action === "no_show_override" && aAudit.rows[0]?.details === "no_show_fan -> completed" && aAudit.rows[0]?.admin_id === CREATOR_USER_ID)) {
      throw new Error("admin_actions row for -> completed is wrong");
    }

    // ---------- 2. no_show_fan -> cancelled_admin (refund) ----------
    row = admin.locator("tr").filter({ hasText: B.slice(0, 8) });
    await row.getByRole("button", { name: "Override" }).click();
    await admin.getByRole("radio", { name: "Refund fan (full)" }).check();
    await admin.getByPlaceholder("Required reason").fill("grant refund despite no-show (dispute)");
    await admin.getByRole("button", { name: "Confirm override" }).click();
    await sleep(1500);
    const b = await db.query("SELECT status, cancelled_by, cancel_reason, payout_eligible_at FROM bookings WHERE id = $1", [B]);
    const bAudit = await db.query(
      "SELECT action, details, reason, admin_id FROM admin_actions WHERE booking_id = $1",
      [B],
    );
    console.log("[2] booking B:", JSON.stringify(b.rows[0]));
    console.log("[2] admin_actions B:", JSON.stringify(bAudit.rows[0]));
    if (!(b.rows[0]?.status === "cancelled_admin" && b.rows[0]?.cancelled_by === "admin" && b.rows[0]?.payout_eligible_at == null)) {
      throw new Error("no_show_fan -> cancelled_admin did not persist correctly");
    }
    if (!(bAudit.rows[0]?.action === "no_show_override" && bAudit.rows[0]?.details === "no_show_fan -> cancelled_admin")) {
      throw new Error("admin_actions row for -> refund is wrong");
    }

    // ---------- 3. reject no_show_creator ----------
    await db.query("UPDATE bookings SET status = 'no_show_creator' WHERE id = $1", [C]);
    row = admin.locator("tr").filter({ hasText: C.slice(0, 8) });
    await row.getByRole("button", { name: "Override" }).click();
    await admin.getByPlaceholder("Required reason").fill("should be rejected");
    await admin.getByRole("button", { name: "Confirm override" }).click();
    await admin.waitForSelector("text=Override is not supported for this booking status", { timeout: 10000 });
    const c = await db.query("SELECT status FROM bookings WHERE id = $1", [C]);
    const cAudit = await db.query("SELECT count(*) FROM admin_actions WHERE booking_id = $1", [C]);
    console.log("[3] booking C status after rejected override:", c.rows[0]?.status, "| admin_actions rows:", cAudit.rows[0].count);
    if (c.rows[0]?.status !== "no_show_creator" || cAudit.rows[0].count !== "0") {
      throw new Error("no_show_creator override was not cleanly rejected");
    }
    // Close the override modal before the next case.
    await admin.getByRole("button", { name: "Cancel", exact: true }).click();

    // ---------- 4. reject cancelled_creator ----------
    await db.query("UPDATE bookings SET status = 'cancelled_creator' WHERE id = $1", [D]);
    row = admin.locator("tr").filter({ hasText: D.slice(0, 8) });
    await row.getByRole("button", { name: "Override" }).click();
    await admin.getByPlaceholder("Required reason").fill("should be rejected");
    await admin.getByRole("button", { name: "Confirm override" }).click();
    await admin.waitForSelector("text=Override is not supported for this booking status", { timeout: 10000 });
    const d = await db.query("SELECT status FROM bookings WHERE id = $1", [D]);
    const dAudit = await db.query("SELECT count(*) FROM admin_actions WHERE booking_id = $1", [D]);
    console.log("[4] booking D status after rejected override:", d.rows[0]?.status, "| admin_actions rows:", dAudit.rows[0].count);
    if (d.rows[0]?.status !== "cancelled_creator" || dAudit.rows[0].count !== "0") {
      throw new Error("cancelled_creator override was not cleanly rejected");
    }

    await adminCtx.close();
    console.log("ALL CHECKS PASSED");
  } finally {
    await db.query("DELETE FROM admin_actions WHERE booking_id IN ($1,$2,$3,$4)", [A, B, C, D]);
    await db.query("DELETE FROM bookings WHERE id IN ($1,$2,$3,$4)", [A, B, C, D]);
    await db.query("UPDATE users SET role_admin = $1 WHERE id = $2", [origAdmin.rows[0]?.role_admin ?? false, CREATOR_USER_ID]);
    await db.end();
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
