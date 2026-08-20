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
  } = await supabase.auth.getUser();

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
    request.nextUrl.pathname.startsWith(path),
  );

  // Auth pages — redirect to the intended page if already authenticated
  const authPaths = ["/login", "/signup"];
  const isAuthPage = authPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

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
