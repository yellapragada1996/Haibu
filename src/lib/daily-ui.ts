// Shared helpers for the custom call UI (call-object mode).
//
// NOTE: the previous Prebuilt-iframe theme + injected CSS (DAILY_THEME,
// DAILY_CSS, DAILY_DEBUG_CSS) were removed when the call screen moved to
// call-object mode — the custom UI renders its own tiles and controls, so no
// Daily DOM/class-name styling is needed anymore.

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function initialsAvatarDataUrl(name: string) {
  // A tiny SVG data URL instead of a canvas-rendered PNG: Daily caps the
  // `userData` payload at 4096 chars, and a 200x200 PNG (with anti-aliased
  // text) was ~4KB. The SVG is ~300 bytes and renders identically.
  const initials = initialsFor(name) || "H";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#232323"/><text x="100" y="100" fill="#FFFFFF" font-size="80" font-weight="600" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
