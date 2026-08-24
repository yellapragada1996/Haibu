import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isSafeRedirectPath } from "@/lib/safe-redirect";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Path-boundary matcher: a protected/auth path must be an exact match or a
  // real sub-path ("/creator" or "/creator/x"), NOT a prefix of a longer word.
  // Otherwise "/creator" wrongly matches the PUBLIC "/creators/..." route.
  const matchesPath = (pathname: string, path: string) =>
    pathname === path || pathname.startsWith(path + "/");

  // Protected routes — redirect to /login if unauthenticated, carrying the
  // original path (including query params, e.g. a booking's ?offering=&slot=)
  // so the user returns to exactly where they were after login.
  const protectedPaths = [
    "/dashboard",
    "/bookings",
    "/book",
    "/creator",
    "/admin",
    "/api/protected",
  ];
  const isProtected = protectedPaths.some((path) =>
    matchesPath(request.nextUrl.pathname, path),
  );

  // Auth pages — redirect to the intended page if already authenticated
  const authPaths = ["/login", "/signup"];
  const isAuthPage = authPaths.some((path) =>
    matchesPath(request.nextUrl.pathname, path),
  );

  // Suspended accounts: a banned user still carries a session cookie, but
  // Supabase returns a `user_banned` error from getUser(). Treat this as a
  // distinct state — not "logged out" — so a suspended user gets a clear
  // message instead of bouncing between /login and protected pages on a stale
  // cookie. Scoped to protected routes only: /login and /signup stay reachable
  // so the user can attempt a login (which surfaces the friendly suspension
  // message) or create a fresh account, and public pages keep working.
  if (userError?.code === "user_banned" && isProtected) {
    return NextResponse.redirect(new URL("/suspended", request.url));
  }

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set(
      "redirect",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(url);
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    const rawTarget = request.nextUrl.searchParams.get("redirect");
    // The redirect param may itself carry a query string (e.g.
    // /book/abc?offering=x&slot=y) — split it so pathname and search are set
    // independently instead of mangling the ? into the pathname.
    const q = rawTarget ? rawTarget.indexOf("?") : -1;
    const targetPath = q === -1 ? rawTarget : rawTarget!.slice(0, q);
    const targetSearch = q === -1 ? null : rawTarget!.slice(q);
    // isSafeRedirectPath also rejects backslashes — WHATWG normalization
    // turns "/\evil.com" into "//evil.com" (open redirect, CWE-601).
    url.pathname = isSafeRedirectPath(targetPath) ? targetPath : "/dashboard";
    url.search = targetSearch ?? "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
