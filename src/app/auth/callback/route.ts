import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isSafeRedirectPath } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Determine redirect target: prefer the explicit query param, fall back to
  // the auth_redirect cookie the proxy sets when sending unauthenticated users
  // to /login (survives OAuth round-trips where query params can be lost).
  const rawNext = searchParams.get("next");
  let next: string;
  if (rawNext && isSafeRedirectPath(rawNext)) {
    next = rawNext;
  } else {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get("auth_redirect")?.value;
    next = isSafeRedirectPath(fromCookie) ? fromCookie : "/dashboard";
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`);
      res.cookies.delete("auth_redirect");
      return res;
    }
    if (error.code === "user_banned") {
      const res = NextResponse.redirect(`${origin}/suspended`);
      res.cookies.delete("auth_redirect");
      return res;
    }
  }

  const res = NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
  res.cookies.delete("auth_redirect");
  return res;
}
