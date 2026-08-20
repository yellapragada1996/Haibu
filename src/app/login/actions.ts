"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

// Exact-email lookup against auth.users (email is citext — case-insensitive).
//
// Guards the signup form against duplicate registrations. GoTrue's signUp
// never rejects an existing email (confirmed or not): it silently re-sends a
// confirmation — and for an unconfirmed user it rotates the stored
// confirmation token while the emailed code is the stale one, so the user
// receives an OTP that can never verify. This check lets the app intercept
// the duplicate BEFORE signUp is called, avoiding that broken path entirely.
export async function checkEmailStatus(
  email: string,
): Promise<{ registered: boolean; confirmed: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { registered: false, confirmed: false };

  const rows = await db.execute(
    sql`SELECT email_confirmed_at FROM auth.users WHERE email = ${normalized} LIMIT 1`,
  );
  const row = rows.rows[0] as { email_confirmed_at: string | null } | undefined;
  if (!row) return { registered: false, confirmed: false };
  return { registered: true, confirmed: row.email_confirmed_at != null };
}
