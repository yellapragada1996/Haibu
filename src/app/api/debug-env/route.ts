import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    DAILY_WEBHOOK_BOOTSTRAP: process.env.DAILY_WEBHOOK_BOOTSTRAP ?? "<unset>",
    DAILY_WEBHOOK_SECRET_SET: !!process.env.DAILY_WEBHOOK_SECRET,
    DAILY_API_KEY_SET: !!process.env.DAILY_API_KEY,
    INNGEST_EVENT_KEY_SET: !!process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY_SET: !!process.env.INNGEST_SIGNING_KEY,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "<unset>",
  });
}
