// Step 13 admin panel end-to-end verification (real app + real DB + real
// Supabase, no mocks). Exercises: admin gate (non-admin 404 / admin 200),
// NavBar admin link, report status action, admin force-cancel (status +
// reason persistence), and suspend/unsuspend via Supabase native ban.
//
// NOTE: force-cancel's Stripe refund + ledger branch is exercised only in the
// null-payment-intent case here (the dev DB has no confirmed booking with a
// real Stripe PaymentIntent). The branch mirrors actions/cancel.ts exactly.

const { chromium } = require("playwright");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const crypto = require("crypto");

const BASE = "http://localhost:3000";
const FAN_ID = "0d719919-6565-4063-8de2-772f63e25125"; // fan@haibu.test (Elizabeth)
const CREATOR_USER_ID = "f0660cc5-f7b2-439b-a61a-83bdbfd0a071"; // creator@haibu.test (Queen)
const CREATOR_PROFILE_ID = "073c016e-db44-460f-9c32-824ec9c7d367";
const OFFERING_ID = "8c1410e0-eddb-423d-86c8-c409a9f4ed87"; // Piano Lessons (30 min)

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

async function main() {
  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();

  // Service-role Supabase client for defensive cleanup (unban) in finally.
  const adminAuth = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // --- setup ---
  // Promote creator to admin (record original to restore).
  const origAdmin = await db.query(
    "SELECT role_admin FROM users WHERE id = $1",
    [CREATOR_USER_ID],
  );
  await db.query("UPDATE users SET role_admin = true WHERE id = $1", [CREATOR_USER_ID]);

  // Test report row.
  const reportId = crypto.randomUUID();
  await db.query(
    `INSERT INTO reports (id, reporter_id, reported_user_id, booking_id, reason, status)
     VALUES ($1, $2, $3, NULL, $4, 'open')`,
    [reportId, FAN_ID, CREATOR_USER_ID, "test admin report — please ignore"],
  );

  // Test confirmed booking (no payment intent — mirrors the leftover manual
  // test bookings that actually exist in this dev DB).
  const bookingId = crypto.randomUUID();
  const start = new Date(Date.now() + 10 * 86400000);
  const end = new Date(start.getTime() + 30 * 60000);
  await db.query(
    `INSERT INTO bookings (id, fan_id, creator_id, offering_id, status, start_at, end_at, price_cents, platform_fee_cents, creator_payout_cents)
     VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, 4000, 720, 3280)`,
    [bookingId, FAN_ID, CREATOR_PROFILE_ID, OFFERING_ID, start.toISOString(), end.toISOString()],
  );

  const browser = await chromium.launch();
  try {
    // ---------- 1. non-admin gate: fan → /admin → 404 ----------
    const fanCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const fan = await fanCtx.newPage();
    await login(fan, "fan@haibu.test");
    const forbidden = await fan.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    const fanBody = await fan.evaluate(() => document.body.innerText);
    const got404 = forbidden?.status() === 404 || /404|not found|could not be found/i.test(fanBody);
    console.log("[1] non-admin /admin → status", forbidden?.status(), "| 404 in body:", got404);
    if (!got404) throw new Error("Non-admin was not blocked from /admin");
    await fanCtx.close();

    // ---------- 2. admin gate + NavBar link ----------
    const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const admin = await adminCtx.newPage();
    await login(admin, "creator@haibu.test");

    await admin.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    // The avatar is the only <img> in the nav (search button is an inline SVG).
    await admin.locator("nav img[alt]").first().click();
    await admin.getByRole("link", { name: "Admin", exact: true }).waitFor({ timeout: 5000 });
    console.log("[2] NavBar avatar dropdown shows Admin link");

    await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await admin.waitForSelector("text=Reports", { timeout: 15000 });
    console.log("[3] Admin panel loads for role_admin user");

    // ---------- 3. report status action ----------
    await admin.waitForSelector(`text=test admin report — please ignore`, { timeout: 15000 });
    const reportRow = admin.locator("tr").filter({ hasText: "test admin report — please ignore" });
    await reportRow.getByRole("button", { name: "actioned" }).click();
    await sleep(1500);
    const rep = await db.query("SELECT status FROM reports WHERE id = $1", [reportId]);
    console.log("[4] reports.status after action:", rep.rows[0]?.status);
    if (rep.rows[0]?.status !== "actioned") throw new Error("Report status did not update");

    // ---------- 4. force-cancel ----------
    await admin.goto(`${BASE}/admin/bookings`, { waitUntil: "networkidle" });
    const bookingRow = admin.locator("tr").filter({ hasText: bookingId.slice(0, 8) });
    await bookingRow.getByRole("button", { name: "Force cancel" }).click();
    await admin.getByPlaceholder("Required reason").fill("test force-cancel reason");
    await admin.getByRole("button", { name: "Confirm full refund + cancel" }).click();
    await sleep(1500);
    const bk = await db.query(
      "SELECT status, cancelled_by, cancel_reason FROM bookings WHERE id = $1",
      [bookingId],
    );
    console.log("[5] booking after force-cancel:", JSON.stringify(bk.rows[0]));
    if (!(bk.rows[0]?.status === "cancelled_admin" && bk.rows[0]?.cancelled_by === "admin" && bk.rows[0]?.cancel_reason === "test force-cancel reason")) {
      throw new Error("Force-cancel did not persist expected state");
    }

    // ---------- 5. suspend / unsuspend ----------
    await admin.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
    const fanRow = admin.locator("tr").filter({ hasText: "fan@haibu.test" });
    await fanRow.getByRole("button", { name: "Suspend" }).click();
    await sleep(1500);
    let ban = await db.query("SELECT banned_until FROM auth.users WHERE id = $1", [FAN_ID]);
    console.log("[6] banned_until after suspend:", ban.rows[0]?.banned_until);
    if (!ban.rows[0]?.banned_until) throw new Error("Suspend did not set banned_until");

    const fanRow2 = admin.locator("tr").filter({ hasText: "fan@haibu.test" });
    await fanRow2.getByRole("button", { name: "Unsuspend" }).click();
    await sleep(1500);
    ban = await db.query("SELECT banned_until FROM auth.users WHERE id = $1", [FAN_ID]);
    console.log("[7] banned_until after unsuspend:", ban.rows[0]?.banned_until);
    if (ban.rows[0]?.banned_until) throw new Error("Unsuspend did not clear banned_until");

    await adminCtx.close();
    console.log("ALL CHECKS PASSED");
  } finally {
    // Cleanup
    await adminAuth.auth.admin.updateUserById(FAN_ID, { ban_duration: "none" }).catch(() => {});
    await db.query("DELETE FROM reports WHERE id = $1", [reportId]);
    await db.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
    await db.query(
      "UPDATE users SET role_admin = $1 WHERE id = $2",
      [origAdmin.rows[0]?.role_admin ?? false, CREATOR_USER_ID],
    );
    await db.end();
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
