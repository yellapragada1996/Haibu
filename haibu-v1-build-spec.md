# Haibu — v1 Build Specification (for implementation)

> This is an implementation spec. It is intentionally prescriptive on money, concurrency, identity, and no-show logic — do not deviate from those sections. Where a choice is genuinely open, it is marked **[OPEN]** with a default. Build in the order given in Section 12. Do not build features not listed here; deferred features are in Section 13 and must not be started in v1.

---

## 1. Product summary

Haibu is a marketplace web app where fans book paid 1-on-1 live video sessions with creators. A creator publishes session offerings (fixed duration, fixed price). A fan browses, picks an open time slot, pays upfront, and both join a live video call at the scheduled time. The platform takes a percentage cut.

- **v1 categories only:** `casual_talk`, `asmr`, `music`. No other categories.
- **SFW only.** No adult/companionship content.
- **Responsive web app.** No native mobile app. Must work well on mobile browsers.
- **Two roles:** `fan` (books) and `creator` (offers). One account can be both (a creator can also book others).

---

## 2. Tech stack (fixed)

- **Framework:** Next.js (App Router) + TypeScript. Deploy on Vercel.
- **DB:** PostgreSQL.
- **ORM:** Drizzle. Use Drizzle migrations.
- **Auth:** Supabase Auth (email/password + Google OAuth).
- **Video:** Daily.co (server-created rooms + meeting tokens + webhooks).
- **Payments:** Stripe Connect (Express accounts) + Stripe Checkout/PaymentIntents + Stripe Identity.
- **Delayed jobs:** Inngest (reminders, fund release, reservation expiry).
- **Email:** Resend.
- **Media storage:** Cloudflare R2 (S3-compatible) or Supabase Storage. **[OPEN]** default R2.
- **Styling:** Tailwind CSS + shadcn/ui.

Environment variables must be documented in a `.env.example`. Never hardcode secrets.

---

## 3. Design system (fixed — see separate design doc for full detail)

- Dark mode only for consumer UI. Base `#121212`, surfaces `#1A1A1A`, cards `#1E1E1E`–`#232323`.
- Accent `#A81120` — only on primary CTAs, logo dot, active pill/tab state, price highlights. Never a large fill.
- Live/available indicator: green `#3BD671` only.
- Fully rounded corners (YouTube-style). Cards 12–16px, pills 999px.
- Primary text white/near-white; secondary `#8A8A8A`.
- Admin screens exempt (plain light utility UI is fine).
- Logo assets provided separately (`haibu-logo-*.svg`).

---

## 4. Data model (PostgreSQL / Drizzle)

**Money rule (non-negotiable):** all monetary amounts are stored as **integer cents** (e.g. `2000` = $20.00). Currency is `usd` for v1 (single currency). Never use float/decimal for money in application logic.

**Time rule:** all timestamps stored as UTC `timestamptz`. Slot times are absolute UTC instants. Display in the viewer's local timezone on the client. Store each user's IANA timezone string for reminders/display.

### 4.1 `users`
- `id` uuid pk
- `email` text unique not null
- `display_name` text not null
- `avatar_url` text null
- `timezone` text not null (IANA, e.g. `America/Toronto`)
- `is_creator` boolean default false
- `role_admin` boolean default false
- `created_at` timestamptz default now()

### 4.2 `creator_profiles` (1:1 with a user who is a creator)
- `id` uuid pk
- `user_id` uuid fk → users unique not null
- `bio` text
- `category` enum(`casual_talk`,`asmr`,`music`) not null  *(primary category for browse)*
- `intro_video_url` text null
- `banner_url` text null
- `stripe_account_id` text null  *(Stripe Connect Express account)*
- `stripe_onboarding_complete` boolean default false
- `identity_verified` boolean default false  *(Stripe Identity passed)*
- `is_published` boolean default false  *(only true when onboarding + identity done AND creator toggled live)*
- `created_at` timestamptz default now()

A creator profile may only be `is_published = true` when `stripe_onboarding_complete` AND `identity_verified` are both true. Enforce in application logic AND document as an invariant.

### 4.3 `offerings` (a bookable session type a creator sells)
- `id` uuid pk
- `creator_id` uuid fk → creator_profiles not null
- `title` text not null  *(e.g. "Late-night chat")*
- `category` enum(same as above) not null
- `duration_minutes` int not null  *(allowed values: 15, 30, 45, 60)*
- `price_cents` int not null  *(min 500 = $5.00; max 50000 = $500.00)*
- `is_active` boolean default true
- `created_at` timestamptz default now()

### 4.4 `availability_windows` (recurring weekly availability, used to *generate* candidate slots)
- `id` uuid pk
- `creator_id` uuid fk not null
- `day_of_week` int not null  *(0=Sunday … 6=Saturday, in the creator's timezone)*
- `start_minute` int not null  *(minutes from midnight, creator-local)*
- `end_minute` int not null
- `created_at` timestamptz default now()

Windows define *when a creator is generally available*. Actual bookable slots are derived by combining windows + offering durations, then subtracting already-booked/blocked times. See Section 6.

### 4.5 `availability_blocks` (one-off blackout periods — vacations, etc.)
- `id` uuid pk
- `creator_id` uuid fk not null
- `start_at` timestamptz not null
- `end_at` timestamptz not null

### 4.6 `bookings`
- `id` uuid pk
- `fan_id` uuid fk → users not null
- `creator_id` uuid fk → creator_profiles not null
- `offering_id` uuid fk → offerings not null
- `start_at` timestamptz not null
- `end_at` timestamptz not null
- `status` enum not null — see state machine Section 7
- `price_cents` int not null  *(snapshot of offering price at booking time)*
- `platform_fee_cents` int not null  *(computed at booking)*
- `creator_payout_cents` int not null  *(price − platform_fee)*
- `stripe_payment_intent_id` text null
- `daily_room_name` text null
- `daily_room_url` text null
- `fan_joined_at` timestamptz null  *(from Daily webhook)*
- `creator_joined_at` timestamptz null  *(from Daily webhook)*
- `reservation_expires_at` timestamptz null  *(set during checkout hold)*
- `cancelled_by` enum(`fan`,`creator`,`admin`,`system`) null
- `cancel_reason` text null
- `created_at` timestamptz default now()

**Concurrency-critical constraint:** add a partial unique index preventing two active bookings for the same creator overlapping the same start time:
```
UNIQUE INDEX on (creator_id, start_at)
WHERE status IN ('reserved','confirmed','completed')
```
This is the primary defense against double-booking. See Section 6.3.

### 4.7 `ledger_entries` (append-only money ledger — source of truth for money movement)
- `id` uuid pk
- `booking_id` uuid fk null
- `type` enum(`charge`,`platform_fee`,`creator_payout`,`refund`,`chargeback`,`reserve_hold`,`reserve_release`) not null
- `amount_cents` int not null  *(signed: positive = into platform, negative = out)*
- `currency` text default 'usd'
- `stripe_reference` text null  *(payment intent / transfer / refund id)*
- `note` text null
- `created_at` timestamptz default now()

Never mutate a ledger entry. Corrections are new entries. All money movement must produce a ledger entry.

### 4.8 `reviews`
- `id` uuid pk
- `booking_id` uuid fk unique not null  *(one review per booking, from the fan)*
- `creator_id` uuid fk not null
- `rating` int not null  *(1–5)*
- `text` text null
- `created_at` timestamptz default now()

Only creatable when the associated booking `status = 'completed'`.

### 4.9 `reports`
- `id` uuid pk
- `reporter_id` uuid fk → users not null
- `reported_user_id` uuid fk → users not null
- `booking_id` uuid fk null
- `reason` text not null
- `status` enum(`open`,`reviewed`,`actioned`,`dismissed`) default 'open'
- `created_at` timestamptz default now()

### 4.10 `blocks`
- `id` uuid pk
- `blocker_id` uuid fk → users not null
- `blocked_id` uuid fk → users not null
- unique on (blocker_id, blocked_id)

A blocked pairing prevents booking in either direction.

---

## 5. Auth & onboarding

### 5.1 Fan signup
Email/password or Google. On signup create `users` row, capture timezone from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`), allow override in settings.

### 5.2 Creator onboarding (gated, sequential)
A user becomes a publishable creator only after ALL steps:
1. Fill profile: bio, category, avatar, optional intro video/banner.
2. **Stripe Connect Express onboarding** — redirect to Stripe-hosted onboarding, store `stripe_account_id`, set `stripe_onboarding_complete` from the `account.updated` webhook when `charges_enabled` + `payouts_enabled`.
3. **Stripe Identity verification** — creator completes an Identity session; set `identity_verified` on the `identity.verification_session.verified` webhook.
4. Create at least one active offering.
5. Set availability windows.
6. Creator toggles "Go live" → `is_published = true` (only allowed if steps 2 & 3 passed).

Do not allow booking of an unpublished creator. Do not allow payout to a creator without completed Connect onboarding.

---

## 6. Availability & slot generation

### 6.1 Concept
Do not store pre-generated slots in the DB. Generate candidate slots **on read**, then filter against existing bookings and blocks. This avoids a giant slots table and keeps availability flexible.

### 6.2 Generation algorithm (server-side, for a given creator + offering + date range)
1. For each day in range, find `availability_windows` matching that day_of_week (in creator's tz).
2. Within each window, step forward in increments of the offering's `duration_minutes`, producing candidate `[start_at, end_at]` UTC intervals. (v1: slots are back-to-back, aligned to window start. **[OPEN]** slot granularity — default: increments equal to duration, no gaps.)
3. Remove any candidate that overlaps an existing booking (status in `reserved`,`confirmed`,`completed`) for that creator.
4. Remove any candidate overlapping an `availability_block`.
5. Remove any candidate whose `start_at` is in the past or within the next 60 minutes (minimum booking lead time — **[OPEN]** default 60 min).
6. Return remaining candidates as bookable slots.

### 6.3 Booking a slot — concurrency (critical)
The window between "fan selects slot" and "payment confirmed" must not allow a second fan to book the same slot.

Flow:
1. Fan selects a slot → server attempts to **insert a `bookings` row with status `reserved`** and `reservation_expires_at = now() + 10 minutes`. The partial unique index (Section 4.6) makes a conflicting reservation fail atomically. If insert fails on conflict → return "slot just taken," refresh availability.
2. On successful reservation, create a Stripe PaymentIntent for `price_cents`. Return client secret to the fan for payment.
3. Fan completes payment → Stripe webhook `payment_intent.succeeded` → transition booking `reserved → confirmed`, create Daily room, write ledger `charge` entry, schedule reminders.
4. If payment not completed before `reservation_expires_at`, an Inngest job transitions `reserved → expired` (frees the slot) and cancels the PaymentIntent.

Never mark a booking `confirmed` from the client. Only the Stripe webhook confirms.

---

## 7. Booking state machine

States: `reserved` → `confirmed` → `completed`, with branches to `expired`, `cancelled_fan`, `cancelled_creator`, `cancelled_admin`, `no_show_fan`, `no_show_creator`.

Allowed transitions:
- `reserved → confirmed` (payment succeeded)
- `reserved → expired` (reservation timed out, no payment)
- `confirmed → completed` (session happened; both joined per telemetry, or ended normally)
- `confirmed → cancelled_fan` (fan cancels before start; refund per policy Section 9)
- `confirmed → cancelled_creator` (creator cancels; full refund to fan always)
- `confirmed → cancelled_admin` (admin force-cancel; full refund)
- `confirmed → no_show_fan` (creator joined, fan did not — Section 8)
- `confirmed → no_show_creator` (fan joined, creator did not — full refund to fan)

Each transition must be idempotent (safe to receive a duplicate webhook). Guard on current status before transitioning.

---

## 8. No-show determination (telemetry-based — do not use self-reporting)

Use Daily.co webhooks (`participant.joined` / `participant.left`) to stamp `fan_joined_at` and `creator_joined_at` on the booking. After the session's scheduled `end_at` + a short grace (5 min), an Inngest job evaluates:

- Both joined → `completed`. Release funds per Section 10.
- Creator joined, fan never joined → `no_show_fan`. **Creator is still paid** (their time was reserved), fan is **not** refunded. (Rationale: protects creator supply.)
- Fan joined, creator never joined → `no_show_creator`. **Full refund to fan.** No payout.
- Neither joined → treat as `cancelled_creator`-equivalent: full refund to fan, no payout. (**[OPEN]** — default to refunding the fan when nobody showed.)

Do not rely on a "mark no-show" button. The join telemetry is the source of truth. (A manual admin override exists for disputes.)

---

## 9. Cancellation & refund policy

Times relative to session `start_at`:
- Fan cancels **> 24h before**: full refund.
- Fan cancels **1–24h before**: 50% refund. **[OPEN]** default 50%.
- Fan cancels **< 1h before**: no refund.
- Creator cancels (any time): **full refund to fan**, and flag the creator (repeated creator cancellations → admin review; automation deferred).
- Admin cancels: full refund to fan.

All refunds create a `refund` ledger entry and issue a Stripe refund against the PaymentIntent. If funds were already paid out to the creator (shouldn't happen pre-completion, but for chargebacks), record a negative `creator_payout`/`chargeback` ledger entry and rely on Stripe Connect negative balance / future payout clawback.

---

## 10. Money flow & payouts

### 10.1 At booking (confirmed)
- Charge fan `price_cents` via PaymentIntent (funds to platform Stripe account).
- Compute `platform_fee_cents = round(price_cents * PLATFORM_FEE_RATE)`. **PLATFORM_FEE_RATE = 0.18 for v1** (18%). Store both fee and payout on the booking.
- Ledger: `charge` (+price), `platform_fee` (+fee retained).

### 10.2 At completion
- After booking reaches `completed`, and after a hold period, transfer `creator_payout_cents` to the creator's Connect account (Stripe Transfer).
- **Hold period:** funds released **72 hours after completion** for established creators; **7 days** for a creator's first 5 completed sessions (fraud/chargeback buffer). **[OPEN]** default as stated.
- Ledger: `creator_payout` (−payout) + `reserve_hold`/`reserve_release` as appropriate.

### 10.3 Rounding
Fee rounding uses banker's-safe integer math on cents. Never let payout + fee ≠ price. Compute `platform_fee_cents` first, then `creator_payout_cents = price_cents − platform_fee_cents`.

---

## 11. The video session

- Room created server-side on booking `confirmed` (or lazily 15 min before start). Store `daily_room_name`/`daily_room_url`.
- Access gated by short-lived Daily **meeting tokens** issued only to the booking's fan and creator, only within a join window (start − 5 min to end + 5 min).
- Client shows a countdown timer; auto-leave at `end_at`.
- Recording: **off by default** in v1. State in ToS that recording by users is prohibited; do not claim technical prevention (it can't be enforced).
- Webhooks stamp join/leave times (Section 8).

---

## 12. Build sequence (do in this order; each step reviewable independently)

1. **Schema + migrations** (Section 4). Ship the full schema, including the partial unique index and ledger. Review before proceeding.
2. **Auth + user/timezone** (Section 5.1).
3. **Creator onboarding minus payments** — profile, offerings, availability windows/blocks (Sections 5.2 steps 1,4,5).
4. **Stripe Connect onboarding + Stripe Identity** (5.2 steps 2,3), publish gating.
5. **Availability read/generation** (Section 6.1–6.2) + creator-facing availability UI.
6. **Booking reservation + PaymentIntent + concurrency** (Section 6.3) — the money-critical path. Plan-review this before writing it.
7. **Stripe webhooks** → confirm booking, ledger entries, room creation.
8. **Daily room + meeting tokens + join webhooks** (Section 11, 8).
9. **Completion job + no-show evaluation + payout transfers** (Sections 8, 10) — money-critical, plan-review first.
10. **Cancellation/refund flows** (Section 9).
11. **Discovery UI** — homepage (see design doc), category filter, search, creator profile page, booking flow UI.
12. **Reviews, reports, blocks** (Sections 4.8–4.10).
13. **Admin panel** — list/action reports, force-cancel-with-refund, suspend user, manual no-show override.
14. **Email reminders** via Inngest/Resend (confirmation, 24h, 1h before).
15. **Legal pages** — ToS, Privacy, Refund policy, Content policy.

**Plan-review gates:** before writing code for steps 1, 6, and 9, produce a short written plan first (data touched, transitions, failure modes) and wait for review. These three touch schema and money; do not free-run them.

---

## 13. Explicitly deferred — DO NOT build in v1

Tipping; in-app notification center (email only in v1); rescheduling (cancel+rebook only); per-minute billing (fixed-duration slots only); algorithmic recommendations (hand-curated/simple sorts only); reliability-score dashboards; automated suspension thresholds; native mobile / PWA; multi-currency; group/1-to-many sessions; messaging/DMs between users.

If any of these seem needed, stop and raise it for review rather than building it.

---

## 14. Non-negotiable invariants (restate — verify at PR time)

1. Money is integer cents everywhere. No floats in money math.
2. `creator_payout_cents + platform_fee_cents == price_cents` for every booking.
3. Every money movement has a `ledger_entries` row.
4. A booking is only `confirmed` by a Stripe webhook, never the client.
5. Double-booking is prevented by the partial unique index, not just app checks.
6. A creator cannot be published or paid without Connect onboarding + Identity verification.
7. No-show and completion are decided by Daily join telemetry, not self-report.
8. All state transitions are idempotent and guarded on current status.
9. All times stored UTC; displayed in local tz.
10. No deferred (Section 13) feature is present in the v1 build.

---

## 15. Open decisions to confirm before/at build (defaults chosen; flag if changing)
- Media storage: R2 vs Supabase Storage → default R2.
- Minimum booking lead time → default 60 min.
- Slot granularity → default = offering duration, back-to-back.
- Mid-window fan-cancel refund → default 50%.
- Nobody-showed outcome → default full refund to fan.
- Payout hold → default 72h (7d for first 5 sessions).
- Platform fee → **fixed at 18% for v1** (not open).
