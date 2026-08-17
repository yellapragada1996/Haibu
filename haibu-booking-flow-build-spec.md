# Haibu — Booking Flow Build Spec (Deferred Auth)

> **Authoritative build reference.** The build must match this document and the wireframes in `booking-flow-wireframes.html` exactly. This supersedes the exploratory/corrective sections of `haibu-deferred-auth-flow.md`; where they conflict, this document wins. Every item below is a **locked decision** — do not re-add anything listed in §7.

---

## 1. The flow — 4 screens (3 for logged-in users)

```
1. Creator profile  →  2. Slot picker  →  [3. Auth*]  →  4. Payment (+ in-place confirmation)
        │                                only if not
        │                                logged in
        └── logged-in users: 2 → 4 directly (no auth screen)
```

- **No offering-selection screen** — each offering on the profile has its own "Book" button that goes straight to that offering's slot picker.
- **No separate summary screen** — the slot picker's persistent footer is the summary.
- **No separate confirmation route** — confirmation is an in-place success state on the payment screen.

---

## 2. Global rules (every screen)

**Design tokens:** monochrome-first per `haibu-design-token-system.md`. White = primary, gray = neutral, brand red = logo + category pills only, error red = destructive only, green = live/available, yellow = stars. All colors via `@theme` tokens — no raw hex in components.

**Icons:** SVG only, `aria-hidden="true"`, no emojis anywhere.

**Date format (exact):** `toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })` → `"Wed, Aug 20"`.

**Time format (exact):** `toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })` → `"9:30 AM"`.

**Buttons (design system):**
- Primary: white fill (`--color-primary`), dark text (`--color-on-primary`), `--radius-pill`, weight 600.
- Secondary: `--color-neutral-default` fill, white text, pill.
- Ghost: transparent, `--color-text-secondary`, **no border**.
- Destructive: `--color-error` fill, white text.

**Category pills:** brand-red fill (`--color-brand`), white text, pill. **Max 3 visible; if a creator has more than 3 categories, show a neutral `+N` pill** (card bg, `--color-text-secondary`, border).

**Responsive:** mobile-first single column. Desktop = centered column (profile max ~800px, flow screens ~480px). Offerings use an **internal auto-fill grid** — never a page-level two-column split.

**Accessibility:** 44px+ tap targets on mobile, visible focus rings (2px, `--color-primary`), WCAG contrast per the token doc, keyboard-navigable slot/date controls, reduced-motion respected.

**No step counter** ("X of N") anywhere in the flow.

---

## 3. Screen 1 — Creator profile (`haibu.live/@queen`)

**Route:** `/[slug]`-based creator page (route plan in §8). Server-rendered `og:image` (avatar), `og:title` ("Book a live 1:1 session with @queen"), `og:description` (bio excerpt).

**Layout (top to bottom):**
1. **Banner** — full-width strip, only rendered if the creator has a `banner_url`; **hidden entirely when absent**.
2. **Avatar** — overlaps the banner's bottom edge (per profile spec), 64px mobile / 88px desktop, 3px `--bg` border.
3. **Name + Share** — creator name (bold), and a **share icon button immediately beside the name** (icon-only ghost, `aria-label="Share profile"`). Share = `navigator.share()` on mobile, copy-link fallback on desktop; appends `?ref=...` attribution.
4. **Category pills** — brand-red, max 3 + `+N` (see §2), directly under the name.
5. **Rating + session count** — yellow stars + "128 sessions" (real aggregates).
6. **Price / duration** — `from $25 · 30 min`, on its own line (never mixed into the pills).
7. **Bio** — 2-line truncated excerpt.
8. **"How it works" strip** — 3 SVG icons + labels: Pick a time → Pay securely → Join live. Light card, no emojis.
9. **Offerings** — every offering shown (no truncation), each a card with: title, duration, price, and its own **"Book" primary button** (white pill, 44px+ target). The card row itself is NOT clickable.
10. **Recent reviews** — inline section, 2 review previews (avatar, name, ★★★★★, short text) + "View all N reviews →". Rendered on the profile (not a bare link).

**Mobile:** single column, stacked. **Desktop:** single centered column (~800px), offerings as an auto-fill grid inside the column.

---

## 4. Screen 2 — Slot picker

**Route:** `/book/[creatorId]?offering=[id]` (offering preselected via the profile's Book button).

**No login required.** This screen is reachable by any guest.

**Layout (top to bottom):**
1. **Top bar** — back arrow · "Pick a time" · (spacer). **No step counter.**
2. **Offering context bar** — small card: avatar, creator name, offering title, duration ("Queen · Piano Lessons · 30 min").
3. **Date pills** — horizontal scroll (mobile) / wrap (desktop). Format `"Wed, Aug 20"` (see §2). Active = white primary fill; inactive = `bg-bg-card-hover` + `--color-text-secondary`. Pill shape, `h-9 px-4 text-xs`-equivalent.
4. **Time grid** — 3 columns mobile / 4 columns desktop. Format `"9:30 AM"`. States: available, **selected** (white primary), **disabled** (dimmed). Each slot is a button ≥44px with an `aria-label` like `"Wed, Aug 20 — 9:30 AM"`.
5. **Timezone note** — subtle, below the grid: `Times shown in your timezone (EDT)`. Uses the captured user timezone; fallback to browser timezone when unset.
6. **Sticky summary footer (mobile)** — left: `Wed, Aug 20 · 9:30 AM` (small) + total `$40.00` (bold); right: **"Continue"** primary button. **Desktop:** the same summary bar + Continue inline (not sticky) at the bottom of the centered ~480px column.

**On "Continue":**
- **Logged in** → go straight to Screen 4 (Payment).
- **Anonymous** → go to Screen 3 (Auth).

---

## 5. Screen 3 — Auth (conditional, anonymous guests only)

**Route:** the auth screen within the booking flow (login page in "booking context" mode).

**Layout (top to bottom):**
1. **Top bar** — back · "Confirm booking" · (spacer).
2. **Headline:** `Almost there — confirm your booking` (bold, ~18px).
3. **Sub-copy:** `Sign in or create an account to complete your Piano Lessons session with Queen and receive your join link.`
4. **Booking-context card — PROMINENT, placed ABOVE the auth options.** This is the anchor of the screen:
   - Avatar (44px) + creator name (bold) + offering title · duration
   - Divider, then `When` / `Wed, Aug 20 · 3:00 PM` and `Total` / `$40.00` rows
   - The guest sees exactly what they're completing **before** any auth button.
5. **"Continue with Google"** — primary (white fill + multicolor G glyph + dark text), 44px+. Google accounts are auto-confirmed — no email verification.
6. **"Continue with email"** — secondary (neutral), 44px+. **Magic link, not OTP** (hard constraint: `mailer_autoconfirm: false` means unconfirmed users can't get sessions; magic link gives an instant session).
7. **"Already have an account? Log in"** — ghost link.

**No "no code to type" note.** No OTP. No step counter.

---

## 6. Screen 4 — Payment + in-place confirmation

**Route:** payment within the flow. Booking intent restored from `sessionStorage` (`pendingBooking`).

**Payment state:**
1. **Top bar** — back · "Payment" · (spacer).
2. **Summary card** — creator · offering · `Wed, Aug 20 · 3:00 PM` + **"10 min hold on this slot"** note + total `$40.00`.
3. **Stripe Elements** — Apple Pay / Google Pay / Card. Apple Pay requires live-mode domain verification (deployment step).
4. **Security line** — lock icon (SVG) + `Secure payment · Stripe · 10 min hold`.
5. **"Pay $40.00"** — primary, **sticky on mobile** (inline on desktop).
6. **Short reservation** created on entry (existing `reserveSlot` → `reservation_expires_at`, ~10-min TTL, matching the sweep job). Failure: stays on this screen with a clear error, intent intact.

**Confirmation state (in-place success, same screen — no redirect):**
1. `Your session is booked` (bold, centered).
2. `Your join link will be ready on your booking page before the session starts.` (accurate — the join link lives in the app's existing JoinSection, **not email**).
3. Booking card: avatar + `Queen · Piano Lessons` + `Wed, Aug 20 · 3:00 PM · $40.00`.
4. **"View your booking"** — primary → `/bookings/[id]`.

---

## 7. Explicitly removed / do NOT add

- **Emojis** — SVG icons only.
- **VERIFIED badge** — no verification process exists; don't imply one.
- **Offering-selection screen** — per-offering Book buttons replace it.
- **Sticky "Book a session" CTA** on the profile — ambiguous with per-offering buttons.
- **"+1 more offering" truncation** — show all offerings; scroll naturally.
- **Two-column desktop layout** — single centered column.
- **Step counter ("2 of 4")** — removed; forward-action labels instead.
- **"No code to type"** note.
- **Email join-link copy** — join is via the booking page, not email.
- **"wrong email?"** link.
- **"Save your details for next time"** prompt.

---

## 8. Accessibility — WCAG 2.2 AA + best practice

### Standards
- Target **WCAG 2.2 Level AA** (contrast, keyboard, focus, reflow, status messages, target size).
- Touch targets **≥44×44 CSS px** (Apple HIG — exceeds WCAG 2.2's 24px minimum; matches this spec's mobile requirement).
- `lang="en"` on `<html>`; semantic landmarks (`header`, `main`, `footer`); a skip link to main content on every screen.

### Cross-cutting requirements (all screens)
1. **Semantic HTML** — real `<button>` for actions, `<a>` for navigation, `<label>` for form fields, `<h1>`/`<h2>` in order. Never `div`-with-`onClick`.
2. **Focus** — visible 2px focus ring (`--color-primary` or `--color-brand`) on every interactive element; **never `outline: none`** without a replacement; logical DOM focus order; no keyboard traps. WCAG 2.2: focus not obscured, focus appearance ≥3:1 contrast.
3. **Contrast** — body text ≥4.5:1; large text and UI components (buttons, focus indicators, selected states) ≥3:1 — use the known-safe pairs in the design-token doc.
4. **Keyboard** — every action reachable and operable by keyboard alone; date pills and time slots navigable with arrow keys; selected state visible + announced.
5. **Screen readers** — `aria-label` on icon-only buttons (Share, back); date pills and slots expose meaningful names (`"Wed, Aug 20 — 9:30 AM"`); `aria-selected`/`aria-current` on selected pills/slots; `role="status"` (`aria-live="polite"`) for async state changes (reservation, payment processing, confirmation).
6. **Forms** — **visible labels, not placeholder-only**; errors associated to fields via `aria-describedby`, inline + announced; slot required before Continue is enabled.
7. **Touch/mobile** — 44px+ targets, no hover-dependent information (touch has no hover), no tiny targets, no gesture-only interactions.
8. **Motion** — respect `prefers-reduced-motion` (disable slide-up animation and slot transitions).
9. **Reflow** — no horizontal scroll at 320px width; text resizable to 200% without loss.
10. **Status/loading** — async operations (reserving slot, auth redirect, processing payment) disable the triggering button and announce progress; never a silent wait.

### Screen-specific
- **Screen 1 (profile):** `<h1>` = creator name; offering Book buttons have accessible names ("Book Piano Lessons"); share button `aria-label="Share profile"`; banner is decorative (empty `alt`/`aria-hidden`) unless it carries meaning.
- **Screen 2 (slot picker):** date pills + time slots are keyboard-navigable with `aria-selected`; the selected slot is visible (white) and announced; "Continue" disabled until a slot is selected; the timezone note is plain text (read after the grid).
- **Screen 3 (auth):** booking-context card is **content, not interactive** — it must precede the auth buttons in DOM order so screen readers read *what* the guest is completing before *how*; Google/email buttons have clear names; "Already have an account? Log in" is a link; focus moves to the headline on arrival; post-auth errors announced.
- **Screen 4 (payment):** "Pay" disabled + `aria-busy` while processing; success state announced via `role="status"`; payment errors inline and associated; confirmation heading is a proper `h1`.

### Verification gate (before ship)
- **Automated:** axe-core scan (contrast, landmarks, button/link names, aria) on all four screens, mobile + desktop.
- **Manual:** keyboard-only walkthrough of the full flow; screen reader (VoiceOver + TalkBack) pass; 320px reflow; 200% zoom; reduced-motion toggle.

---

## 9. Backend / flow requirements

| Requirement | Detail |
|---|---|
| Creator public URL | `haibu.live/@[slug]` — `@` prefix avoids collision with top-level routes. Slug: from `display_name` (lowercase, spaces→hyphens, strip non-alphanumerics); unique; collisions get numeric suffix (`queen-2`); one self-serve change allowed, old slug redirects 30 days; backfill existing creators. |
| Booking intent | `sessionStorage.setItem('pendingBooking', { creatorId, offeringId, slotStart, slotEnd, priceCents })` before auth; restored on `/auth/callback` → `/book/[creatorId]?restore=true` → straight to the slot picker/summary with selection pre-filled. |
| Auth (email) | Magic link via `signUp({ email, options: { emailRedirectTo } })` — **not OTP** in this flow. Google = auto-confirmed. |
| Reservation | Short reservation at payment entry (~10-min TTL via existing `reserveSlot`/`reservation_expires_at`); unique index is the double-booking backstop. |
| Already logged in | `getUser()` check at slot-picker Continue — skip Screen 3 entirely. |
| `og:` metadata | Server-rendered on the `@[slug]` route. |
| Share | `navigator.share()` + copy fallback + `?ref=` attribution param. |
| Timezone | Slot grid shows "Times in your timezone (EDT)" using the captured `users.timezone`. |
| `next` encoding | Post-auth `next` value `encodeURIComponent`-encoded; callback decodes before the open-redirect guard (`startsWith("/") && !startsWith("//")`). |
| Funnel | `booking_step_viewed` / `booking_step_exited` / `booking_converted` events at each step boundary. |
| Apple Pay | Stripe account live-mode domain verification (deployment config, not code). |

---

## 10. Source of truth

- **This document** — the locked build spec.
- **`booking-flow-wireframes.html`** — the visual wireframes (Screens 1–4, mobile + desktop, incl. confirmation state). The build must reproduce them.
- `haibu-deferred-auth-flow.md` — background/rationale; superseded where it conflicts with this spec.
