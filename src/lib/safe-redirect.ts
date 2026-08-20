// Same-origin redirect-target validation.
//
// A redirect target is only safe when it is a bare in-app path. WHATWG URL
// normalization treats "\" as "/" in special schemes (http/https), so a
// target like "/\evil.com" normalizes to "//evil.com" — a protocol-relative
// URL that escapes the app origin. The old check (`startsWith("/") &&
// !startsWith("//")`) missed that, enabling an open redirect (CWE-601).
export function isSafeRedirectPath(
  target: string | null | undefined,
): target is string {
  return (
    typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.includes("\\")
  );
}
