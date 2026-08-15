# Haibu — Step 11 UI Specification (Discovery + Full Design Retrofit)

> This document is authoritative for Step 11. It supersedes the general visual-system section of the original design doc with exact, buildable detail. Build in the three phases in Section 0. Do not skip ahead a phase without a reviewed screenshot of the prior one.

---

## 0. Build phases (mandatory order)

**Phase 11.1 — Design tokens + shared component library.** No real pages yet. Build a `/dev/components` showcase route rendering every component in every state, for screenshot review.

**Phase 11.2 — New public discovery screens.** Homepage, category page, search, public creator profile — built only from Phase 11.1 components.

**Phase 11.3 — Retrofit existing functional screens** onto the same components: login, dashboard, creator profile/offerings/availability, booking flow (incl. Stripe Elements theming), booking confirmation + cancel modal, call screen chrome.

Each phase must be shown running (screenshots or a reachable URL) and reviewed before the next phase starts.

---

## 1. Design tokens (exact values — do not approximate)

### Color
```css
--bg-base: #121212;        /* page background */
--bg-surface: #1A1A1A;     /* nav bar, footer, elevated bands */
--bg-card: #1E1E1E;        /* card/tile fill */
--bg-card-hover: #232323;  /* card hover, inactive pill fill */
--border-subtle: #2A2A2A;  /* dividers, card borders, input borders */

--text-primary: #FFFFFF;
--text-secondary: #8A8A8A;
--text-tertiary: #5A5A5A;  /* timestamps, least important metadata */

--accent: #A81120;         /* logo dot, primary CTA fill, active pill/tab, price highlight */
--accent-hover: #C21329;
--accent-pressed: #8A0E1A;

--live-green: #3BD671;     /* "available today" indicator only — never decorative */

--error: #EF4444;          /* form errors, destructive confirmations — deliberately NOT --accent, so "you can click this" and "something's wrong" never look the same */
```

### Radius
```css
--radius-card: 14px;
--radius-input: 12px;
--radius-pill: 999px;      /* buttons, chips, tabs, search bar */
--radius-modal: 20px;
```

### Typography
- Font: **Inter** (Google Fonts), fallback `system-ui, sans-serif`. Weights used: 400, 500, 600, 700.
- Scale: H1 32px/700 · H2 24px/600 · H3 18px/600 · Body 15px/400 · Small/meta 13px/400 · Button label 14px/600.
- Logo wordmark stays the existing SVG (Arial/Helvetica bold) — do not substitute Inter into the logo itself.

### Spacing
4px base grid: 4, 8, 12, 16, 24, 32, 48, 64. Card internal padding: 12–16px. Section vertical gap on a page: 32px desktop / 24px mobile.

### Breakpoints
Mobile `<640px` (1 card/row, hamburger menu, nav collapses) · Tablet `640–1024px` (2–3 cards/row) · Desktop `>1024px` (4 cards/row, full nav visible).

---

## 2. Shared component library (Phase 11.1)

Build each as a reusable component (React + Tailwind, per stack). Every screen in Phase 11.2/11.3 must be composed from these — no one-off inline styling of buttons/cards elsewhere.

| Component | States / variants | Notes |
|---|---|---|
| **Button** | `primary` (accent fill, white text, pill), `secondary` (`--bg-card-hover` fill, white text, pill), `ghost` (transparent, `--text-secondary`, used for "See all" links). Sizes: default 44px height, small 36px. `disabled`: 40% opacity, no hover. | Hover/pressed use `--accent-hover` / `--accent-pressed` on primary only. |
| **Card** | base container, `--bg-card`, `--radius-card`, optional hover lift (`translateY(-2px)` + soft shadow). | Base for CreatorCard. |
| **CreatorCard** | Rounded thumbnail/video-preview top (top corners match card radius), name + category pill, price, rating + session count, optional "Available today" badge. | The core discovery unit — used in every shelf/grid. |
| **Pill/Chip** | `inactive` (`--bg-card-hover` fill, `--text-secondary`), `active` (`--accent` fill, white text). | Category filters, tabs. |
| **Badge** | `live` (green fill, dark text), `confirmed` (green outline), `pending/reserved` (accent outline), `cancelled/expired` (muted gray outline), `completed` (white outline). | Booking status labels. |
| **Avatar** | circular image; fallback = initials on `--accent` background if no photo. | |
| **Input** | text/select, `--bg-base` fill, `--border-subtle` border, `--radius-input`; focus = `--accent` border. Error state uses `--error` border + helper text in `--error`. | Search bar is a special pill-shaped (`--radius-pill`) variant per nav spec. |
| **Modal** | `--bg-surface`, `--radius-modal`, backdrop `rgba(0,0,0,0.6)`. | Booking confirm, cancel confirm. |
| **NavBar** | see Section 3. | |
| **Toast** | small rounded card sliding in from top/bottom, auto-dismiss. | "Slot taken," "Booking confirmed," etc. |

Build `/dev/components` rendering all of the above with every state visible, labeled, on the dark background. This route can be removed or left dev-only later — it's a review tool, not a product page.

---

## 3. NavBar (shared across all pages)

- **Left:** hamburger (mobile only, `<640px` — opens a slide-down panel with category links + account links) · logo (`haibu-logo-dark-bg.svg`, links to `/`).
- **Center:** search bar, pill-shaped, `max-width: 560px`, placeholder "Search creators." Search icon button attached at the right edge of the bar (as built in the Visualizer mockup).
- **Right:**
  - If `is_creator = true`: **"Creator Studio"** secondary button linking to `/creator/profile` (not "Become a Creator" — that CTA is only for non-creators).
  - If `is_creator = false` (or logged out): **"Become a Creator"** primary button.
  - Notification bell icon (visual only for v1 — no notification center yet, per build spec Section 13; can be a static icon with no unread-count badge logic).
  - Avatar (circular, links to a dropdown: Dashboard, Creator Studio if applicable, Sign out). If logged out: "Log in" ghost button instead of avatar.
- Sticky/fixed to top, `--bg-surface` background, `1px solid --border-subtle` bottom border.
- On mobile (`<640px`): search bar and category pills collapse into the hamburger panel; nav shows logo + hamburger + avatar only.

---

## 4. New screens (Phase 11.2)

### 4.1 Homepage — `/`

Sections, top to bottom:

1. **NavBar**
2. **Category pill row** — exactly four pills: `All`, `Casual Talk`, `ASMR`, `Music` (mapping to the real `category` enum: `casual_talk`, `asmr`, `music`). `All` active by default.
3. **"Available Today" row** — heading with green dot + "Available today" text. Query: for each published creator, check (via the Step 5 slot-generation function) whether they have ≥1 open slot in the next 24 hours; show up to 12, horizontally scrollable CreatorCards.
4. **"Trending This Week" row** — heading "Trending this week." Query: creators ranked by count of bookings with `status IN ('confirmed','completed','no_show_fan')` and `created_at` in the trailing 7 days, descending, top 12.
5. **Category shelves** — one per category (`Casual Talk`, `ASMR & Relaxation`, `Music Sessions`), each a horizontal row of that category's published creators, sorted by rating (or `created_at DESC` if no reviews yet), up to 12 per shelf.
6. **"Become a Creator" band** — full-width `--bg-surface` section, one-line pitch, primary button. Always shown regardless of login state (logged-in creators simply won't click it, no need to hide it).
7. **Footer** — About, ToS, Privacy, Trust & Safety/Report, Support, Become a Creator, social links (can be placeholder links for v1).

**Empty-state rule (important for a cold-start marketplace):** each row/shelf renders only if it has **≥3 creators** to show. If the platform has **fewer than 3 total published creators**, skip all shelves entirely and render a single flat "Browse creators" grid instead (no empty or near-empty shelves visible). Do not show a shelf with 1-2 lonely cards — it looks broken, not exclusive.

No platform-wide stats/trust band in v1 (already decided in the base design doc — do not add one back in).

### 4.2 Category page — `/browse/[category]`

- NavBar, category pill row (current category active).
- H1: category display name ("ASMR & Relaxation" / "Casual Talk" / "Music Sessions").
- Full grid (not shelf) of all published creators in that category, sorted by rating desc. Paginate with a "Load more" button (24 per page) — no infinite scroll needed for v1.
- Empty state: centered message "No creators here yet — check back soon," with a ghost-button link to "Become a Creator."

### 4.3 Search — `/search?q=`

- NavBar (search bar pre-filled with the query).
- Same grid layout as category page.
- Query logic: case-insensitive substring match on `creator_profiles.bio` joined with `users.display_name`, `is_published = true` only. No fuzzy search / ranking algorithm for v1 — plain `ILIKE`.
- Empty state: "No creators matched '[query]'."

### 4.4 Public creator profile — `/creators/[id]`

Uses `creator_profiles.id` (uuid) directly in the URL for v1 — no pretty slug/handle (that's a v1.1 nicety, not required now).

- NavBar
- Banner (`banner_url`, full-width, rounded corners matching card radius top; if none, a solid `--bg-card` placeholder — no fake stock imagery).
- Avatar overlapping the banner's bottom edge, bordered.
- Creator display name (H1), category pill, small identity-verified checkmark icon next to the name if `identity_verified = true` (subtle, not a big badge).
- Bio text.
- Rating (avg of `reviews.rating` for this creator) + total session count (count of `completed` bookings) — real aggregates, computed at request time is fine for v1 volume.
- **Offerings section:** one Card per active offering — title, duration, price, "Book" primary button. Clicking opens the slot picker (reuses Step 6 UI, now styled) either inline below or via navigation to `/book/[creatorId]?offering=[id]`.
- **Reviews section:** latest 10 reviews, each showing reviewer avatar/name, star rating, text, relative date. If zero reviews: "No reviews yet — be the first to book a session."

---

## 5. Retrofit screens (Phase 11.3)

### 5.1 Login/signup — `/login`

Replace the current two-button layout entirely. New layout:
- Centered card, `max-width: 400px`, vertically centered on `--bg-base`.
- Logo at top of card.
- **Segmented tab control** (two pill tabs: "Log in" / "Sign up") — not two differently-sized buttons. Switching tabs swaps the form's submit behavior and button label, same field set.
- Email + password Inputs.
- Primary Button, label matches active tab ("Log in" / "Create account").
- Divider ("or") + Google OAuth button below — styled as a secondary/dark button following Google's own dark-mode brand button guidance (neutral dark fill, official Google "G" icon, do not recolor Google's logo).

### 5.2 Dashboard — `/dashboard`

- NavBar.
- If `is_creator = false`: a Card prompting "Become a creator" with the pitch + primary button.
- If `is_creator = true`: a Card linking to Creator Studio (`/creator/profile`).
- "Upcoming sessions" section: list of the user's own upcoming bookings (as fan and, if applicable, as creator), each as a compact Card with Badge showing status, linking to `/bookings/[id]`.
- Empty state: "No upcoming sessions — browse creators" with a link to `/`.

### 5.3 Creator profile/offerings/availability — `/creator/*`

- Retrofit existing forms onto Input/Button/Card components.
- Tab nav (profile / offerings / availability) restyled as Pill tabs, active state in accent.
- Offerings list: each offering as a Card (not a raw list row), edit/deactivate as small secondary/ghost buttons.
- Availability: weekly windows shown as day Pills with time ranges inside Cards; blocks as a simple dated list with delete buttons.
- Stripe Connect / Identity / Go Live section: status shown via Badge (`pending` accent-outline / `complete` green-outline), buttons per current state exactly as built in Step 4 logic — this phase only restyles, does not change any gating logic.

### 5.4 Booking flow — `/book/[creatorId]`

- Date pills (horizontal scroll) above a grid of time-slot Buttons (available slots only, per Step 5 output) — selected slot uses `active` pill styling.
- "Confirm and pay" opens a Modal summarizing offering/date/time/price, then mounts the Stripe Payment Element.
- **Stripe Elements must be themed to match**, not left as Stripe's default light widget. Use Stripe's `appearance` API:
  ```js
  appearance: {
    theme: 'night',
    variables: {
      colorPrimary: '#A81120',
      colorBackground: '#1A1A1A',
      colorText: '#FFFFFF',
      colorDanger: '#EF4444',
      borderRadius: '12px',
    }
  }
  ```
- "Slot taken" failure → Toast component + availability refresh (per Step 6's existing UX logic — this phase only applies the visual components to that already-working flow).

### 5.5 Booking confirmation + call screen — `/bookings/[id]`, `/bookings/[id]/call`

- Confirmation page: Card with session details, status Badge, countdown (plain styled text, no need for a fancy visual timer widget in v1), Join button (disabled/muted until join window per Step 8 logic).
- Cancel section: secondary Button "Cancel session" → Modal showing the refund amount before confirming (reuses Step 10's existing `cancelBooking` logic — this phase only styles it).
- Call screen: minimal chrome — dark background, small header showing session title + countdown/leave button, Daily Prebuilt iframe filling the remaining space. Daily's own in-call UI cannot be restyled beyond what Daily's API allows — do not attempt to override it beyond basic theming options Daily exposes.

---

## 6. Data-fetching approach (resolves the Step 1 RLS flag)

All Phase 11.2/11.3 screens fetch data via **Next.js Server Components using Drizzle + the service-role connection**, the same pattern already used everywhere in this build (Steps 2–10) — not client-side `supabase-js` calls. This means **no public RLS policies need to be written for v1** — the Step 1 flag to "write RLS policies for `creator_profiles`/`offerings` at Step 11" is resolved by not needing client-side reads at all. If any future interactive feature (live search-as-you-type without page reload, client-side filters) is added, use a Next.js Route Handler backed by the same Drizzle/service-role pattern, not a direct client-to-Supabase call.

---

## 7. What's explicitly NOT in Step 11

No infinite scroll (use "Load more"), no algorithmic recommendations, no notification center (bell icon is visual only), no pretty creator URLs/slugs, no custom Daily in-call UI beyond basic theming, no dark/light mode toggle (dark only), no animation library beyond simple CSS transitions (hover lift, modal fade).
