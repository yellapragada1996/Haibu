import { NextResponse } from "next/server";

export async function GET() {
  const vars = [
    "RESEND_API_KEY",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
    "INNGEST_DEV",
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
    "NEXT_PUBLIC_APP_URL",
    "DAILY_API_KEY",
  ];

  const status: Record<string, boolean> = {};
  for (const v of vars) {
    status[v] = !!process.env[v];
  }

  return NextResponse.json(status);
}
