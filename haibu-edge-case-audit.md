# Haibu — Edge-Case Audit Matrix (35 tests)

Audit document for an AI agent (or engineer) to execute against the running app.
Every test is self-contained: what the app does, exact steps, expected result,
and how to verify. Report any test that fails as a **bug**, with the test ID,
observed vs expected, and a screenshot/DOM dump if possible.

---

## 1. Environment & setup

- Repo: `/Users/raghavendra/Documents/Projects/Haibu` (private GitHub: yellapragada1996/Haibu)
- Stack: Next.js 16.3.0 (App Router) + Supabase (GoTrue auth, Postgres) + Stripe + Daily.co
- **Node must be 22+** — the system node is 16 and will fail:
  ```bash
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
  ```
- Start the dev server: `npm run dev` → http://localhost:3000
- A production build must pass: `npm run build`
- Playwright is available in the repo (`node_modules/playwright`) — write test
  scripts in the repo root so `require("playwright")` resolves.
- DB access: `DATABASE_URL` is in `.env.local`; use the `pg` module from the
  repo (scripts must live in the repo root — `/tmp` cannot resolve `pg`).
- Supabase service-role key (for creating test users): `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

## 2. Credentials & data facts

| Thing | Value |
|---|---|
| Test fan login | `fan@haibu.test` / `haibu123` (confirmed, password login works) |
| Seeded creator emails | `seed-<slug>@haibu.test` — **no password**, cannot password-login (only usable via admin API if needed) |
| Admin (owner) | `yellapragada1996@gmail.com` — Google OAuth only; **do not rely on it for automated tests** |
| Known creator | `@queen` (display name contains "Queen") |
| 24/7 creators | Query: `SELECT cp.slug FROM availability_windows aw JOIN creator_profiles cp ON cp.id=aw.creator_id WHERE aw.start_minute=0 AND aw.end_minute=1440 GROUP BY cp.id LIMIT 5` (e.g. @cole-zen, @nia-snap, @rex-echo) |
| Categories (12) | `casual_talk` (Casual Talk), `asmr` (ASMR), `music` (Music), `comedy`, `storytelling`, `gaming`, `spiritual`, `fitness`, `art`, `cooking`, `study-with-me` (Study With Me), `dance` |
| Published creators | 108 |
| Creator timezones | America/Toronto (110 users), UTC (22 users) — good for timezone tests |
| Ratings | ~81 creators have ratings (seeded 80 reviews + Queen); the rest have none |

**Key routes:** `/` (home), `/browse`, `/browse?available=today`, `/browse/<category-slug>`,
`/browse/<slug>?available=today`, `/search?q=`, `/@<slug>` (creator profile),
`/slot/<creatorId>?offering=<id>` (public slot picker), `/login`, `/verify-email`,
`/book/<creatorId>?offering=<id>&slot=<ISO>` (payment, auth required),
`/auth/callback?code=&next=`, `/api/availability?creator_id=&offering_id=&from=&to=`.

**Verification conventions**
- "Pill row unchanged" = the same pill buttons (same count, same labels, same order) are
  present before and after clicking/filtering. This family of bugs (pills disappearing)
  has regressed multiple times — check every permutation.
- Card measurement: `document.querySelector('a[href^="/@"]')` (or the card link in the
  grid) → `getBoundingClientRect()`. At viewport ≥ 1024px with the 1200px container,
  cards are **220.8 × 294.4** px. Identical on home, browse, and search.
- "Log out" state: use a fresh Playwright context (no cookies) — sessions live in cookies.
- Slot times: the app displays slots in the **viewer's** timezone with a note
  "Times shown in your timezone (…)". The API returns UTC ISO strings.

---

## A. Category pills & card consistency (12 tests)

### A1 — Home: pill row is complete and nav works
**What the app does:** Home renders a pill row: `All` (static) + all 12 categories as
links to `/browse/<slug>`. There is no in-place filtering on home; pills are navigation.
**Steps:** logged out → goto `/` → read the pill row (`[role]` or the flex container with
`Pill` buttons / links). Assert: exactly 13 pills (`All` + 12 categories, in sort order:
Casual Talk, ASMR, Music, Comedy, Storytelling, Gaming, Spiritual, Fitness, Art, Cooking,
Study With Me, Dance). Click `Casual Talk`.
**Expected:** navigates to `/browse/casual_talk` (no 404); pill row on that page is
complete (see A5).

### A2 — Home: `All` pill is always present
**What the app does:** `All` is the default/active pill on home.
**Steps:** goto `/`; assert an active pill labeled `All` exists and appears first.
**Expected:** present, styled as active (white fill).

### A3 — Browse: pills never vanish when filtering
**What the app does:** `/browse` pills = `All` + all categories (or narrowed to
available-today categories when `?available=today`, see A4).
**Steps:** logged out → `/browse` → count pills (13 expected) → click `Music` →
lands on `/browse/music`.
**Expected:** after navigating, the pill row still shows all categories; `All` is present
and links back to `/browse`. **Pills must not shrink to only the current category.**

### A4 — Browse?available=today: pills narrow to categories that have creators available TODAY
**What the app does:** with `?available=today`, `/browse` computes pills from the set of
creators whose availability window covers now+60 min (server SQL). Empty categories are
hidden — so the row may be `All + ASMR + Music` (or just `All` late in the day). This is
**by design**, not a bug.
**Steps:** `/browse?available=today` → assert every non-`All` pill's category has ≥1
available-today creator (cross-check via `/api/availability` for one of that category's
creators, or the SQL in §1). Click a pill.
**Expected:** pills unchanged after clicking; `All` still present; heading says
"Available today". Cards shown are all available today.

### A5 — Browse/[category]: pills show ALL categories, not just the selected one
**What the app does:** `/browse/<slug>` renders the full category list as pills; the
current one is `active`. With `?available=today` the pills come from ALL available-today
creators **across categories** (never just the current category).
**Steps:** `/browse/music` → assert pill row contains non-Music categories (e.g. ASMR,
Comedy, Fitness) plus `All`; current pill `Music` is active. Click `ASMR`.
**Expected:** navigates to `/browse/asmr`; pill row still complete; no 404.

### A6 — Browse/[category]?available=today: cross-category available pills
**What the app does:** `/browse/music?available=today` shows pills for every category
that has ≥1 available-today creator (e.g. ASMR even though we're on Music), preserving
`?available=today` on every pill's href. This was the "pill vanishing" regression.
**Steps:** `/browse/music?available=today` → assert every pill shown corresponds to a
category with an available-today creator; click `All`.
**Expected:** lands on `/browse?available=today` (All keeps the filter); pills unchanged;
no freeze.

### A7 — Search: pills come from FULL results; filtering happens client-side
**What the app does:** `/search?q=` computes pills from the complete (unfiltered) result
set; clicking a pill filters cards in JS so other pills never disappear. Ranking is
Postgres `ts_rank` on `search_tsv` (display_name weight A > offering titles/category B >
bio C > profile category D).
**Steps:** `/search?q=passionate` (matches only Queen) → assert exactly 1 card and pills =
`All` + Queen's categories (ASMR, Music — **not** all 12). Click `ASMR`.
**Expected:** pills unchanged after clicking; cards filter to Queen; `All` restores all.

### A8 — Search: All pill after a filter does not freeze
**What the app does:** an earlier regression froze the page clicking `All` after a
filtered search; fixed by keeping the filter in JS and pills from full results.
**Steps:** `/search?q=session` → click a category pill → click `All`.
**Expected:** results return instantly (<2 s); no console errors; pills present.

### A9 — Cards are identical across home / browse / search
**What the app does:** every grid uses the same container `max-w-[1200px]` and the same
column classes (`grid-cols-2 sm:3 md:4 lg:5`); cards are `aspect-[3/4]` links to `/@slug`.
**Steps:** at viewport 1280px, measure a card's bounding box on `/`, `/browse`,
`/browse/music`, `/search?q=session`.
**Expected:** identical dimensions on all four pages (220.8 × 294.4 px at lg).
A card that renders larger (e.g. 260.8 × 347.7) is a regression.

### A10 — Card content: rating only if it exists; price; max 2 category pills + N
**What the app does:** card body shows: display name; up to **2** brand-red category
pills + a "+N" overflow pill (e.g. "Study With Me" must NOT overflow/cut the name);
a ★ rating with number ONLY when the creator has reviews (nothing — no gray star/dash —
when none); "From $X" price.
**Steps:** find a rated creator (e.g. `@queen`) and an unrated one (query DB:
`SELECT cp.slug FROM creator_profiles cp LEFT JOIN reviews r ON r.creator_id=cp.id
GROUP BY cp.id HAVING COUNT(r.id)=0 LIMIT 1`).
**Expected:** rated card shows `★ 4.x`; unrated card shows no star element. A creator with
3 categories shows exactly 2 pills + "+1". Nothing overflows the card's body.

### A11 — Available-today section hidden when empty
**What the app does:** home hides "Available today" entirely when no creator is
bookable within the next 60 min (common late evening). "Discover" still shows.
**Steps:** at a time when availability is sparse (after ~23:00 local, or temporarily
disable a 24/7 creator via DB), goto `/` logged out.
**Expected:** no "Available today" heading; "Discover" section present; no empty section.

### A12 — Value prop persists when filtering (anonymous)
**What the app does:** anonymous users see the headline "Book a live 1:1 video session
with a creator" on home **and** on all browse/search views — it must not vanish when a
category or `available=today` filter is active.
**Steps:** logged out → `/browse/music`, `/browse?available=today`, `/search?q=session`.
**Expected:** the headline is visible on each; when logged in, it disappears (by design).

---

## B. Auth, redirects & booking context (13 tests)

### B1 — Login from a creator page returns to that page
**What the app does:** navbar "Log in" carries `?redirect=<current path>`; `/login`
resolves it after hydration (a `useState` initializer would be pinned to `/dashboard` by
SSR — fixed). After email/password login the user lands on the original page.
**Steps:** fresh context (logged out) → `/@queen` → click navbar `Log in` → assert URL
contains `redirect=%2F%40queen` → fill `fan@haibu.test` / `haibu123` → submit.
**Expected:** final URL is `http://localhost:3000/@queen` (NOT `/dashboard`).

### B2 — Login from a filtered browse page
**What the app does:** the navbar link carries only the pathname (query dropped by
design), so `/browse?available=today` → after login lands on `/browse` (no filter).
**Steps:** logged out → `/browse?available=today` → `Log in` → authenticate.
**Expected:** lands on `/browse` (the dropped query is acceptable/documented); must NOT
land on `/dashboard`.

### B3 — Already-logged-in visitor to /login?redirect=… goes to the target
**What the app does:** middleware bounces auth pages to the `?redirect=` target for
authenticated users (validated same-origin path); without it, `/dashboard`.
**Steps:** log in first → `goto /login?redirect=%2Fsearch`.
**Expected:** ends on `/search`, not `/dashboard`.

### B4 — Open-redirect attempts are rejected
**What the app does:** middleware, login page, and `/auth/callback` all validate the
redirect: must start with `/` and not start with `//`. Anything else falls back to
`/dashboard`.
**Steps:** log in → then test each URL while logged in (middleware path):
`/login?redirect=%2F%2Fevil.com`, `/login?redirect=https%3A%2F%2Fevil.com`,
`/login?redirect=%2F%5C%5Cevil.com`, `/auth/callback?code=bad&next=%2F%2Fevil.com`.
**Expected:** never leaves the app origin; all land on an in-app path (target or
`/dashboard`, or `/login?error=auth_callback_error` for the callback). No `evil.com`.

### B5 — No redirect param → dashboard after login
**Steps:** logged out → `goto /login` (no query) → authenticate.
**Expected:** final URL `/dashboard`.

### B6 — Stale booking intent + normal login shows the normal form
**What the app does:** the slot picker saves `pendingBooking` in `sessionStorage`; `/login`
only shows the "Almost there — confirm your booking" card when the user genuinely came
from the picker (`?redirect=/book/...`). Otherwise it **clears** the stale intent.
**Steps:** fresh context → `goto /login` → inject stale intent:
```js
sessionStorage.setItem("pendingBooking", JSON.stringify({creatorId:"00000000-0000-0000-0000-000000000000", creatorName:"Stale", avatarUrl:null, offeringId:"x", offeringTitle:"T", durationMinutes:30, slotStart:new Date(Date.now()+3600e3).toISOString(), priceCents:2000, displayDate:"Today", displayTime:"9:00 AM"}));
```
→ `goto /login?redirect=%2F%40queen`.
**Expected:** NO "Almost there" text; normal email/password form visible.

### B7 — Genuine booking flow shows the "Almost there" card
**Steps:** logged out → `/@queen` → click a `Book` button → slot picker → select a time
button → `Continue`.
**Expected:** lands on `/login?redirect=%2Fbook%2F...` and the card "Almost there —
confirm your booking" appears with creator name, offering title + duration, date · time,
and price. (Card renders async after mount — wait up to ~8 s.)

### B8 — verify-email honors ?redirect= after OTP verification
**What the app does:** an unconfirmed user is sent to `/verify-email?redirect=<path>`.
After entering the correct 6-digit code, they must return to `<path>` (fixed: the target
was pinned to `/dashboard` by hydration).
**Steps:** create a fresh user (signup UI with a disposable inbox, or admin API — see
Appendix) → sign in → land on `/verify-email?redirect=%2Fbrowse` → retrieve the OTP from
the email (mail.tm inbox or SMTP capture) → enter it → Verify.
**Expected:** ends on `/browse`, not `/dashboard`.

### B9 — Unconfirmed user hitting a protected page is gated and returned after verify
**What the app does:** `(protected)/layout` renders `<EmailGate>` for authenticated but
unconfirmed users, redirecting to `/verify-email?redirect=<original path>`.
**Steps:** with the unconfirmed user from B8, `goto /dashboard` (logged in, before
verifying) → observe redirect to `/verify-email?redirect=%2Fdashboard` → verify OTP.
**Expected:** after verification, lands on `/dashboard` (the original target).

### B10 — Forgot password: recovery OTP → reset → login with new password
**What the app does:** "Forgot password" calls `resetPasswordForEmail`; a 6-digit
recovery code is emailed; `verifyOtp(type: "recovery")` unlocks a "set new password"
step; then the user logs in with the new password.
**Steps:** logged out → `/login` → Forgot password → `fan@haibu.test` → get recovery code
from the inbox → enter it → set `newpass123` → log in with `fan@haibu.test` /
`newpass123`.
**Expected:** login succeeds with the new password; the old password no longer works.
(Note: reset the password back to `haibu123` afterwards to keep later tests green.)

### B11 — Forgot password does not reveal whether an email exists
**What the app does:** same generic message for known and unknown emails.
**Steps:** forgot password with `definitely-not-here-12345@nowhere.test`.
**Expected:** message reads "If that email exists, we sent a reset code." (or identical
text), never "user not found" / different wording.

### B12 — Wrong OTP shows an error; resend has a 60 s cooldown
**Steps:** sign up a fresh email → at the verify screen enter 6 wrong digits.
**Expected:** clear error message (no crash, no redirect). Click "Resend code in Ns" —
button must be disabled with a countdown starting at 60; after expiry it re-enables.

### B13 — OAuth callback with an invalid code fails gracefully
**What the app does:** `/auth/callback` tries `exchangeCodeForSession`; on failure it
redirects to `/login?error=auth_callback_error` (never a 500).
**Steps:** `goto /auth/callback?code=not-a-real-code&next=%2Fdashboard` (logged out).
**Expected:** redirected to `/login?error=auth_callback_error`; page renders normally.

---

## C. Availability, lead time & timezone boundaries (10 tests)

Use the availability API for deterministic checks:
```
GET /api/availability?creator_id=<uuid>&offering_id=<uuid>&from=<ISO>&to=<ISO>
```
Grab a 24/7 creator's `creator_id` + an offering `id` from the DB (or from a slot-picker
URL: `/slot/<creatorId>?offering=<id>`).

### C1 — No slot is offered within the 60-minute lead time
**What the app does:** slots are generated per creator-local window grid; any slot whose
**start** is before now+60 min is excluded (fixed: the generator previously checked the
slot's END, so near-term slots appeared but reserve rejected them with a generic error).
`reserveSlot` enforces the same rule server-side.
**Steps:** `GET /api/availability?...&from=<now>&to=<now+3h>` for a 24/7 creator.
**Expected:** every returned `slots[].start_at` ≥ now+60 min. Count of slots starting in
`[now, now+60)` must be **0**.

### C2 — Slots beyond the lead time ARE offered (today still bookable)
**Steps:** same API call as C1.
**Expected:** at least one slot with `start_at` ≥ now+60 min; first slot ≈ now+60 min
aligned to the creator's duration grid (15/30/45/60 min steps).

### C3 — Lead-time boundary: a slot ending just after the cutoff but starting before it is excluded
**What the app does:** this is the exact regression fixed in C1 — a 15-min slot starting
at now+49 min ends at now+64 min but must NOT be offered.
**Steps:** with a 24/7 creator and a 15-min offering, call the API with
`from=<now+40min>` … verify against returned slots.
**Expected:** no slot has `start_at` in `(now, now+60)`.

### C4 — Slot picker shows no unbookable times (UI mirrors the API)
**Steps:** logged out → pick a 24/7 creator via `/@<slug>` → Book → slot picker.
**Expected:** every visible time button maps to a UTC start ≥ now+60 min (compare against
the API response for the same creator/offering). Clicking the earliest slot → Continue →
login → booking page must show the Pay form, **never** "Something went wrong."

### C5 — 30-day maximum booking window
**What the app does:** both the generator (caps `to` at now+30 days) and `reserveSlot`
(rejects `start_at > now+30d`) enforce the cap.
**Steps:** API `from=<now>&to=<now+31d>` → assert no slot starts after now+30d.
Then (logged in) craft a reserve via the UI: visit
`/book/<creatorId>?offering=<id>&slot=<now+31d ISO>`.
**Expected:** API excludes far-future slots; UI shows "That time is no longer available —
pick another slot." (not a crash).

### C6 — Full-day block kills the entire day even with a date override
**What the app does:** precedence rule: a block covering the whole creator-local day wins
over an override; a partial block only removes overlapping slots. Blocks live in
`availability_blocks`, overrides in `availability_date_overrides`.
**Steps (needs a throwaway creator — seed via SQL, Appendix):** create a 24/7 window,
add a date override opening a few hours, then add a full-day block on the same date.
**Expected:** API returns **zero** slots for that date (block wins). Remove the block →
slots from the override appear.

### C7 — Partial block removes only the overlapping slots
**Steps:** same throwaway creator; add a partial block 10:00–12:00 local on a 24/7 day.
**Expected:** slots before 10:00 and after 12:00 remain; no slot overlaps the block
(verify `start_at`/`end_at` vs block bounds).

### C8 — Date override replaces the recurring pattern for that day only
**What the app does:** on a day with `availability_date_overrides` rows, ONLY those
windows apply (recurring `availability_windows` are ignored that day).
**Steps:** throwaway creator with a Monday window 09:00–17:00; add an override for next
Monday 14:00–15:00.
**Expected:** next Monday returns slots only within 14:00–15:00; other Mondays keep
09:00–17:00; other days unchanged.

### C9 — Creator timezone vs viewer timezone
**What the app does:** availability is generated against the **creator's** stored
timezone (`users.timezone`); the API returns UTC; the slot picker renders in the
**viewer's** timezone with the note "Times shown in your timezone (…)". Creator TZs in
the DB are America/Toronto and UTC.
**Steps:** find a UTC creator and an America/Toronto creator (SQL in §1). Open both slot
pickers in a viewer whose browser TZ is America/New_York (or set via Playwright
`context.addInitScript` / TZ env).
**Expected:** each grid's wall-clock times match the creator's window converted to the
viewer's TZ (e.g. a UTC creator's 09:00–12:00 window appears as 05:00–08:00 for a
New_York viewer); the timezone note shows the viewer's abbreviation; no off-by-one hour.

### C10 — Concurrent reservation race: only one booking wins
**What the app does:** a unique index on `(creator_id, start_at)` for status
reserved/confirmed/completed makes the second concurrent reserve fail with
`slot_taken` → UI shows "Slot just taken. Try another."
**Steps:** need two logged-in users — `fan@haibu.test` + a second user created via the
Appendix. Open two browser contexts (one per user) on the SAME
`/book/<creatorId>?offering=<id>&slot=<same future ISO>` (a 24/7 creator, slot ≥60 min
out). Trigger reserve in both (the page auto-reserves on `?slot=`; otherwise click a time
then Pay — auto-reserve is expected).
**Expected:** exactly one context reaches the Pay form; the other shows
"Slot just taken. Try another." with a refreshed grid. No 500s, no double bookings.

---

## Appendix — utilities for the other AI

**Create a second confirmed user (for C10, B8, B9)** via SQL (scripts run from the repo
root; `pg` resolves there):
```sql
-- requires DATABASE_URL from .env.local; trigger on_auth_user_created builds public.users
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'audit2@haibu.test',
  crypt('haibu123', gen_salt('bf')), now(),
  '{"display_name":"Audit Fan 2"}', now(), now());
```
**Retrieve an OTP for B8/B9/B10/B12:** codes are emailed via Supabase SMTP — use a
disposable inbox (e.g. mail.tm API) as the signup email, or an SMTP capture if configured.
There is no plaintext OTP in the DB.

**Throwaway creator for C6–C8:** reuse the seeded pattern — insert an `auth.users` row
(no password needed), let the trigger create `public.users`, insert
`creator_profiles` (published, with a slug), 1 offering, then the windows/blocks/
overrides. Give it a unique slug (`@audit-<ts>`) and remember the `creator_id` UUID.

**Reset after tests:** `fan@haibu.test` password (B10), delete `audit2@haibu.test`,
delete throwaway creators, and re-run `npm run build` to confirm the app still builds.
