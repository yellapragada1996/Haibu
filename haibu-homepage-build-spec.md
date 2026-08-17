# Haibu — Homepage Build Spec

> Authoritative. Source of truth: `homepage-redesign-wireframe.html` (approved). Locked decisions only — this is the build contract.

## 1. Page structure (top → bottom)

1. **Top bar** (state-aware)
2. **Value prop** — anonymous visitors only
3. **Category filter pills**
4. **Available today** — 2 rows + "View more"
5. **Discover** — 2 rows + "View more"
6. **Become a Creator band** — centered
7. **Bottom nav** (mobile only)

## 2. Top bar (state-aware)

| State | Left | Center | Right |
|---|---|---|---|
| **Logged out** | logo | search bar | **Log in** (ghost) · **Sign up** (primary, filled) |
| **Logged in, not creator** | logo | search bar | **Become a Creator** (compact primary pill) |
| **Logged in, creator/admin** | logo | search bar | avatar → profile menu |

- Desktop: logo left · search is the **dominant centered element** (flex, max 480px, search button on the right end — YouTube pattern) · right actions fixed.
- Mobile: logo · search (flex) · right per state above.
- Bottom nav (mobile): **Home · Search · Bookings · Profile**. Profile opens a menu: Dashboard / Become a Creator / Settings / Admin / Sign out.

## 3. Value prop

- Text: **"Book a live 1:1 video session with a creator"** — single line, **no sub-line**.
- Shown **only to anonymous visitors** (hidden once logged in).
- Plain text (no box/card). ~17px mobile, ~22px centered desktop.

## 4. Category filter pills

- Pills: **`Trending`** (default/active) · `Casual Talk` · `ASMR` · `Music`.
- Active = white (`--color-primary` + `--color-on-primary`), inactive = `bg-bg-card-hover` + `text-text-secondary`, `--radius-pill`, ~34px tall.
- Behavior: Trending = the default homepage view; category pills navigate to `/browse/[category]`.
- Horizontal scroll on narrow screens (no wrap).

## 5. Creator card (the atomic unit)

**Shape:** tall poster, `aspect-ratio: 3 / 4` (≈200×380), `--radius-card`, `overflow: hidden`, border `--border-subtle`, bg `--color-bg-card`.

**Content (top → bottom):**
1. **Thumbnail** — top ~70% of the card, `object-cover` (avatar/photo). Gray placeholder when absent.
2. **Name** — semibold, 1 line, truncate.
3. **Category pills** — brand red (`--color-brand`), max 3 + `+N` (neutral pill for overflow).
4. **Rating** — `★ 4.9` (star glyph + number, `--color-rating`), shown **only if the creator has ≥1 review**. If no reviews → **nothing** (no grayed star, no dash).
5. **Price anchor** — `From $X` (`--color-text-secondary`).

**Interaction:** the whole card links to **`/@slug`** (the new creator profile), with fallback to `/creators/[id]` if no slug.

**Hover:** subtle lift + border highlight. Tap target = whole card (≥44px).

## 6. Sections

### Available today
- Heading "Available today" + "View more →" link (→ `/browse`).
- **2 rows** of cards, then View more. (Desktop: 2×5 = 10; mobile: 2×2 = 4.)
- Membership: creators with open availability today (v1: all published creators with active offerings, rating-sorted; availability-today via the slot generator is a follow-up).

### Discover
- Heading "**Discover**" + "View more →".
- **2 rows** of cards (same rule).
- The rest of the creators not shown above (or the full catalog when Available today is a subset).

### Sort
- **rating descending → session count → price asc.** No sort UI.

### Become a Creator band
- Centered card: "Become a creator" / "Book live sessions, grow your audience, get paid." / centered primary button → creator onboarding.

## 7. Search (YouTube behavior)

- Focus (empty) → dropdown with **recent searches** (from `localStorage`: clock icon, per-item ×, "Clear all").
- Typing (debounced ~200ms) → **live suggestions**: creator names/@handles, offering titles, categories.
- **Keyboard:** ↑/↓ navigate, Enter search, Esc close.
- Click suggestion → search it.
- **Mobile:** tapping the bar expands to a **full-screen overlay** (input + suggestions, back to dismiss).
- **ARIA:** `role="combobox"` + `listbox`, `aria-activedescendant`, `aria-expanded`.
- Result: Enter/click → `/search?q=…`.

## 8. Responsiveness

| Breakpoint | Grid |
|---|---|
| Mobile (<640) | 2 columns |
| Tablet (640–1024) | 3–4 columns |
| Desktop (≥1024) | 5 columns |

- Cards hold `aspect-ratio: 3 / 4` at every breakpoint (no distortion).
- Pill rows scroll horizontally; bottom nav only on mobile; desktop uses the top bar.

## 9. Accessibility (WCAG 2.2 AA + Apple HIG)

- Touch targets ≥44×44px (cards are full-width tappable).
- Visible 2px focus ring (`--color-primary`/`--color-brand`) on every interactive element; never `outline: none`.
- Contrast: text ≥4.5:1, UI ≥3:1 (design-token known-safe pairs).
- Keyboard: all navigation + search (combobox) keyboard-operable.
- Screen readers: `aria-label` on icon-only buttons (search, avatar); meaningful names on cards ("Book a session with Queen"); pill states as `aria-current`/tabs.
- No emojis — SVG icons only, `aria-hidden`.
- `prefers-reduced-motion`: disable lift/transition animations.
- Reflow: no horizontal scroll at 320px (pills scroll, content does not); 200% zoom safe.
- Status/loading: skeleton or stable layout while fetching.

## 10. Data & wiring

- `getCreatorsWithOfferings`: select creator `id`, `slug`, `display_name`, `avatar_url`, offering `category`/`price_cents`/`duration_minutes`/`id`, plus **real aggregates**: avg `rating` + `review_count` (public guest reviews) and `session_count` (completed bookings). No hardcoded zeros.
- Card → `/@slug` (verified on the rendered homepage).
- Category pills → `/browse/[category]`; "View more" → `/browse` (or category view).

## 11. Explicitly removed / do NOT add

- No "All creators" name — it's **Discover**.
- No sort UI, no step counter, no emojis, no grayed "★ —" for missing ratings, no "Keep up to 82%", no hero box for the value prop, no left hamburger drawer (bottom nav + profile menu instead).

## 12. Verification gate (before ship)

- `tsc --noEmit` → 0 · `npm run build` → 0.
- Homepage `/` renders: value prop (anon-only — absent when logged in), pills, Available today (2 rows), Discover (2 rows), band, bottom nav on mobile.
- Card links → `/@slug` (grep the rendered HTML).
- Rating shows only when ≥1 review; no "★ —" anywhere.
- Keyboard: tab through pills/cards/search; search combobox works.
- 320px viewport: no horizontal page scroll.
- axe-core scan: no critical violations.
