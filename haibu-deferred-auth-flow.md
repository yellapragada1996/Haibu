# Haibu — Deferred Auth Booking Flow

> The highest-leverage conversion feature in the product. A guest arrives from a creator's Instagram/YouTube link having never heard of Haibu. This flow's job is to get them from "curious" to "paid booking confirmed" with the minimum possible friction. Every step that isn't strictly necessary is a step that loses someone.

---

## 1. The core insight from research

<cite index="44-1">26% of users abandon checkout specifically because of forced account registration.</cite> For Haibu, where guests arrive cold from a creator's social media link, this number is likely higher — they came to book *that specific creator*, not to sign up for a new platform. Interrupting them with a registration wall before they've selected a slot or seen a price is the single biggest conversion killer in this flow.

The research-backed solution: <cite index="48-1">offer guest checkout as the primary path and invite account creation post-purchase, when you have already converted the customer and can frame it as a benefit.</cite>

**For Haibu this means:** let the guest pick their slot and offering first, show them exactly what they're getting, *then* ask them to authenticate — right before payment, with full context about why ("to confirm your booking and send you the join link").

---

## 2. The flow — step by step

### Entry point
A URL in a creator's bio: `haibu.live/@[creator-slug]` — e.g. `haibu.live/@queen`

The `@handle` pattern (Instagram/Threads-style) reads as "this is a creator's profile" instantly to the target audience, and — unlike a bare `/[slug]` — it cannot collide with any existing or future top-level route (`/login`, `/dashboard`, `/book`, `/creator`, etc.). No query params required, no login wall, no redirect. The creator's public profile loads immediately, for anyone.

---

### Step 1 — Creator profile (already exists, minor changes needed)

The guest lands on the creator's public profile. This page already exists. What it needs for this flow:

- **No login required to view** — confirmed, it's a public page
- **A clear, prominent "Book a session" CTA** — primary button (white fill per design system), above the fold, visible before scrolling
- **The offerings visible immediately** — price, duration, category for each — so the guest can make a decision without hunting
- **Creator's avatar, name, bio, rating visible** — trust signals that answer "is this person worth booking?"

**What must NOT happen here:** no "sign up to see more" gate, no modal asking for email before viewing, no friction of any kind. The guest is evaluating. Let them evaluate freely.

---

### Step 2 — Offering selection (already exists, minor changes needed)

Guest clicks "Book a session." If the creator has multiple offerings, a simple selection screen shows (already built as the offering picker). Guest picks one.

**If only one offering exists:** skip this screen entirely and go straight to Step 3. Don't make someone click through a screen with one option.

**State to preserve:** the selected offering is stored in URL state or session storage — `?offering=[id]` — so if the guest authenticates and the page refreshes, their selection isn't lost.

---

### Step 3 — Date and time slot selection (already exists, minor changes needed)

The date-pill row and time slot grid. Guest picks a date and time.

**No login required at this step.** The guest is still evaluating. They haven't committed to anything yet and can't be charged. Showing a login wall here, before they've even picked a time, loses the guests who haven't decided yet.

**State to preserve:** selected date + time slot stored in URL state — `?offering=[id]&slot=[timestamp]` — so it survives authentication.

**One important thing to display here:** the total price, clearly, before they proceed. <cite index="46-1">Unexpected extra costs revealed too late in the flow</cite> are the most common abandonment reason. No surprises at payment.

---

### Step 4 — Booking summary (new screen)

**This is the most important new screen in this flow.** The guest has picked their slot. Before asking for anything, show them exactly what they're getting.

**What this screen shows:**
- Creator name + avatar
- Offering title + duration
- Selected date and time (formatted clearly: "Wednesday, August 20 · 3:00 – 3:30 PM")
- Price (total, not "from $X")
- A one-line note: "You'll get a join link by email once your booking is confirmed."

**The single CTA:** "Continue to book" — primary button (white fill). This is the moment of psychological commitment. The guest is about to pay. They should feel good about what they're getting, not uncertain.

**Already-logged-in guests skip Step 5 entirely.** At this screen, check for an existing session (`supabase.auth.getUser()`). If the guest is already signed in, "Continue to book" goes **straight to Step 6 (payment)** — no auth screen. Returning users should never pay a friction tax for a flow that exists to reduce friction.

**What this screen does NOT show:** a login form, a "create account" banner, anything about Haibu's other features. Just the booking they're about to make.

**State to preserve:** full booking intent (offering + slot + creator) stored in session storage as a JSON object, keyed to this session.

---

### Step 5 — Authentication (modified existing flow)

Only now, after the guest has committed emotionally to a specific session, do we ask them to sign in or create an account.

**Critical: frame it correctly.** Don't say "Create a Haibu account." Say:

> **"Almost there — confirm your booking"**
> Sign in or create an account to complete your Piano Lessons session with Queen and receive your join link.

This framing makes authentication feel like the *last step of booking*, not a detour into signing up for a new platform. The guest already decided to book. They're completing it, not starting over.

**The authentication options, in priority order:**

1. **"Continue with Google"** — primary, most prominent, one click. This is the conversion-critical option for this flow. A guest who clicks a creator's Instagram link and sees "one click with Google" will almost always use it. Google accounts are **auto-confirmed** — verified by Google, no further email confirmation needed. Cleanest path in the flow.
2. **"Continue with email"** — secondary option, expands an inline email form. **For new accounts, this is a MAGIC LINK, not an OTP code.** This is a hard constraint: Haibu has **"Confirm email" ON** (`mailer_autoconfirm: false`), which means an unconfirmed user **cannot get a session** — `signInWithPassword` fails with `email_not_confirmed`, and payment requires a session. A password-signup + OTP flow would therefore block payment entirely. The magic link (`supabase.auth.signUp({ email, options: { emailRedirectTo } })`) delivers an instant session on click — no code to type, no leaving the page to check email. The guest clicks the link and lands back in the flow at Step 6.
3. **"Already have an account? Log in"** — ghost link below both options.

**What must NOT happen here:** the OTP email verification step for new accounts in this flow. A new guest going through this flow should not need to leave the page, check email, type a 6-digit code, and come back. OTP remains the mechanism for the **normal** (non-booking) signup flow — this is a booking-flow-specific conditional, not a global change.

---

### Step 6 — Payment (existing Stripe flow + reservation timing change)

Guest is now authenticated. The booking intent (offering + slot) is retrieved from session storage and pre-filled. Stripe Elements renders.

**Slot reservation — short reservation at payment entry, not before and not none.** The reservation starts when the guest reaches **this screen** (payment entry), reusing the existing `reserveSlot` → `reservation_expires_at` mechanism with a **~10-minute TTL** (matching the current `sweepExpiredReservations` job). Rationale:

- **Not before payment entry:** a slot shown as "available" in Step 3 is not yet reserved, so a guest who never reaches payment can't hold it indefinitely (prevents fake-hold abuse).
- **Not "no reservation at all":** removing reservations entirely creates a race — two guests can pay for the same slot simultaneously and the second fails at the unique-index insert (`(creator, start_at)` in `reserved`/`confirmed`/`completed` statuses) *after* paying. The short reservation protects the payment window; the unique index is the backstop.

**What must be preserved:** if payment fails (card declined, etc.), the guest stays on the payment screen with a clear error message and their booking intent intact. They should not lose their slot selection and have to start over.

**Apple Pay / Google Pay — this is a deployment dependency, not automatic.** Stripe's Payment Element renders wallet buttons only if: (a) the Stripe account has **Apple Pay domain verification** completed in live mode, and (b) wallet payment method types are enabled on the Payment Element. Google Pay requires no domain verification but does need the account configured. Flag this as a pre-launch config step, not code.

---

### Step 7 — Confirmation (existing, minor copy changes)

Payment succeeded. Show:
- "Your session is booked"
- Creator name, offering, date/time, price paid
- "You'll receive a join link by email at **[their email]** before your session starts."
- A **"wrong email?" link** — for new (especially magic-link/Google) signups, the address shown may be a typo or a Google default. The link lets the guest correct the email before the booking/join link is sent. An email that goes nowhere is a lost booking.
- A "View your booking" link to `/bookings/[id]`

**For new accounts:** below the confirmation, a single soft prompt: "Save your details for next time — your account is ready." Not a required step. Not a modal. Just a quiet invitation that converts some percentage of one-time guests into returning users.

---

## 3. State preservation — the technical requirement

This flow lives and dies on whether booking intent survives authentication. If a guest picks a slot, signs in, and loses their selection — that's a broken flow that will show up as a spike in drop-offs at the auth step.

**Implementation:** before redirecting to authentication (Step 5), write the booking intent to `sessionStorage`:

```javascript
sessionStorage.setItem('pendingBooking', JSON.stringify({
  creatorId: '...',
  offeringId: '...',
  slotStart: '2026-08-20T15:00:00Z',
  slotEnd: '2026-08-20T15:30:00Z',
  priceCents: 4000,
}));
```

After authentication completes and the user lands on `/auth/callback`, check for a `pendingBooking` in sessionStorage. If present, redirect to `/book/[creatorId]?restore=true` and restore the selection automatically. The guest should land directly on Step 4 (the summary screen) with their slot pre-selected, not back at Step 1.

**URL encoding of the `next` param:** the post-auth redirect contains nested query params — `/auth/callback?next=/book/[creatorId]?offering=...&slot=...`. The `?` and `&` inside the `next` **value** must be `encodeURIComponent`-encoded when building the OAuth redirect (`next=%2Fbook%2F...%3Foffering%3D...`). The callback's open-redirect guard must **decode `next` before validating** it (decode, then check `startsWith("/") && !startsWith("//")`), so an encoded `%2F%2Fevil.com` is still rejected. Confirm this in the callback implementation.

---

## 4. The URL structure

Creator's public link (shared on social): `haibu.live/@[creator-slug]` — e.g. `haibu.live/@queen`, `haibu.live/@whisper-asmr`

**Why `@` and not `/[slug]` or `/c/[slug]`:**
- `@[slug]` cannot collide with existing top-level routes (`/login`, `/dashboard`, `/search`, `/browse`, `/book`, `/creator`, `/settings`, `/bookings`, `/admin`, `/verify-email`, etc.) or any future route — a bare `/[slug]` would silently shadow future top-level pages.
- `@handle` is the recognized "creator profile" pattern for the target audience (Instagram/Threads).
- Same shareability as a bare slug.

**Slug column plan:**
1. Add a `slug` column to `creator_profiles` (unique).
2. **Generate** from `display_name` on profile creation: lowercase, spaces → hyphens, strip non-alphanumerics (e.g. "Whisper ASMR" → `whisper-asmr`).
3. **Enforce uniqueness**; on collision append a numeric suffix (`queen` → `queen-2`, `queen-3`).
4. **Allow the creator to change their slug once** (self-serve or via request); the **old slug redirects to the new one for 30 days** (a `slug_history` table or a redirect map).
5. **Backfill** existing creators with generated slugs.

Booking flow with preserved state:
`/book/[creatorId]?offering=[id]&slot=[timestamp]`

Post-auth redirect: `/auth/callback?next=%2Fbook%2F[creatorId]%3Frestore%3Dtrue`

---

## 5. Mobile-first requirements

<cite index="44-1">Mobile checkouts have around 85% abandonment rate.</cite> The majority of guests clicking a creator's Instagram link will be on mobile. Every screen in this flow must be designed for a phone screen first.

Specific requirements:
- The "Continue with Google" button must be at least 44px tall (WCAG minimum tap target)
- The time slot grid must be thumb-reachable — no tiny tap targets
- The booking summary screen must fit entirely on one mobile screen without scrolling, so the "Continue to book" button is always visible
- The payment screen should support Apple Pay / Google Pay via Stripe — **with the dependency noted in Step 6** (Apple Pay domain verification is a live-mode Stripe account config step, not automatic)

---

## 6. Funnel instrumentation — the measurement requirement

The 90-second claim can't be validated without measuring it. Instrument a drop-off event at **each step boundary** (Step 1 → 2 → 3 → 4 → 5 → 6 → 7):

- `booking_step_viewed` (step number) on each screen render
- `booking_step_exited` (from-step number) when a guest leaves without advancing
- `booking_converted` on payment success

Post-launch, the funnel report should show: how many guests reach Step 4 (commitment), what % of those authenticate (Step 5), and what % of authenticated guests pay (Step 6). That's the data that tells you whether the deferred-auth bet is working, and where the remaining drop-off lives.

---

## 7. Growth & acquisition layer

The booking flow converts guests who *arrive*. This layer makes more guests arrive — and arrive knowing what Haibu is.

### Rich `og:` share card
The creator profile route must render dynamic `og:image` (creator avatar), `og:title` ("Book a live 1:1 session with @queen"), and `og:description` (creator bio excerpt) in the page's `<head>`. **Server-rendered, not client-side.** Every WhatsApp / iMessage / Twitter paste of the link then renders a real preview card instead of a dead gray box. Cheap to build, genuinely high conversion impact.

### Share button on the creator profile
A single "Share" button that calls `navigator.share()` on mobile (native system sheet — the highest-converting path) with a copy-link fallback on desktop. Pre-filled share text: **"Book a live 1:1 with [Creator name] on Haibu — [URL]"**. Append `?ref=instagram` / `?ref=youtube` etc. as a query param so funnel analytics can attribute bookings to channels.

### Sticky "Book a session" CTA on mobile
A persistent bottom bar on the creator profile so the CTA is always thumb-reachable while scrolling. Same primary button, same copy, just pinned.

### "How it works" 3-step strip on the creator profile
**"Pick a time → Pay securely → Join live."** Cold guests who've never heard of Haibu need this. Keep it visually light — 3 icons + 3 short labels, one line each.

### Slot grid shows times in the guest's timezone
Haibu already captures timezone at login. The slot grid should include a subtle **"Times shown in your timezone (EST)"** note. Removes a real source of confusion for remote fans booking creators in different timezones.

### Build items
| Change | Scope | Priority |
|---|---|---|
| Dynamic `og:image` / `og:title` / `og:description` on the `@[slug]` route | Metadata (server-rendered) | High |
| Share button (`navigator.share()` + copy fallback) + `?ref=` attribution | Creator profile | High |
| Sticky mobile "Book a session" bar | Creator profile | Medium |
| "How it works" 3-step strip | Creator profile | Medium |
| Timezone note on the slot grid | Slot picker (Step 3) | Medium |

---

## 8. What this flow does NOT do

- **No guest checkout (pay without an account):** Unlike e-commerce, Haibu *needs* a guest account — you have to send them a join link, they need to access the booking page, the call screen requires auth. A truly anonymous guest checkout isn't viable here. The goal is to make the account creation feel invisible, not to eliminate it.
- **No indefinite slot holds:** a slot is shown as available in Step 3, reserved with a **short TTL (10 min) when the guest reaches payment** (Step 6), and never held before then. Prevents abuse while protecting the payment window.
- **No OTP in the booking flow:** Google (auto-confirmed) or magic link (instant session) only — OTP is reserved for the normal signup flow.
- **No "remember me" or persistent cookie flows:** Standard Supabase session handling is sufficient.

---

## 9. Changes needed in the codebase

| Change | Scope | Priority |
|---|---|---|
| Creator public URL: `@[slug]` instead of `/creators/[uuid]` + slug column/backfill/redirect plan | Route + DB slug column + redirect map | High — this is the link creators share |
| Booking summary screen (Step 4) + already-logged-in skip | New page/component + session check | High |
| Auth screen copy update + booking context (Step 5) | Existing login page, new "context" prop | High |
| **Magic-link email branch for booking-flow signups** (no OTP) | Auth flow conditional | High |
| `sessionStorage` booking intent preservation + `next` encoding | `/book/` page + `/auth/callback` | High |
| **Short reservation at payment entry (~10 min TTL)** | `reserveSlot` call moved to Step 6 | High |
| "Wrong email?" correction on confirmation (Step 7) | Confirmation screen | Medium |
| Apple Pay / Google Pay via Stripe Elements (+ domain verification) | Stripe config + deployment step | Medium |
| Funnel instrumentation (per-step drop-off events) | Analytics | Medium |
| Offering auto-skip if single offering | `/book/` page | Low |

---

## 10. The one thing that matters most

If this flow is built correctly, a creator posts their `haibu.live/@queen` link in their Instagram bio. A fan clicks it on their phone. They see Queen's profile, pick a time slot, see a summary, tap "Continue with Google," confirm payment with Face ID, and get a confirmation screen — all in under 90 seconds, without ever feeling like they signed up for a new platform.

That is the bar. Every decision in this spec is made to protect that 90-second path.
