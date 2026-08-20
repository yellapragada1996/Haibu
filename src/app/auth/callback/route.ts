import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isSafeRedirectPath } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Only allow same-origin paths — reject absolute, protocol-relative, and
  // backslash targets ("/\evil.com" normalizes to "//evil.com", CWE-601).
  const next = isSafeRedirectPath(rawNext) ? rawNext : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
