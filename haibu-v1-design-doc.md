# Haibu — v1 Design Doc

## 1. Product concept

A marketplace where fans discover and book paid 1-on-1 live video sessions with creators. Think "YouTube for booking sessions" — browsable, entertainment-forward, not a formal consulting/tutoring platform.

**v1 wedge categories:** casual conversation, ASMR/relaxation, music. Kept narrow on purpose — do not launch with the full long-tail of categories (yoga, coding help, business consulting, etc). Prove liquidity in a small, coherent set first, expand later.

**Explicitly not the product:** not companionship/adult content, not formal tutoring (Preply/italki), not a subscription content feed (Patreon/OnlyFans). SFW throughout.

**Platform mechanics:** creator sets session offerings (fixed duration, fixed price), buyer books an open slot, pays upfront, both join a live video call at the scheduled time.

## 2. Name

**Haibu** (reused from a prior, abandoned project — the drops/launch platform under this name is discontinued, so the name is free to reuse). Meaning: "hive" — fits a platform that's a bustling hub of many creators, out of which a fan books one private 1-on-1 session.

Known field conflicts (checked, non-blocking): a children's entertainment franchise (Haibu World, Santa Monica), a hairdressing wholesaler app, a digital-health startup, an HR SaaS tool. None are direct competitors in live-video/creator-booking. Do a formal trademark check in the software/entertainment class before heavy brand investment.

## 3. Brand feel

Warm, playful, entertainment-forward — closer to Twitch/YouTube than to ed-tech (Preply, italki) or enterprise SaaS. Creator-first: the person's photo/video is the hero of every screen, not forms or calendars. Cozy enough to suit ASMR/relaxation, energetic enough to suit music/gaming. Trust-forward in a quiet way — ratings, session counts, and verification badges are always visible but never loud.

## 4. Visual design system (locked)

**Theme:** dark mode only for the consumer-facing product.
- Base background: `#121212` (near-black charcoal, not pure black)
- Elevated surfaces (cards, nav bar): `#1A1A1A`
- Card/tile fill: `#1E1E1E`–`#232323`
- Primary text: white / near-white
- Secondary text: muted gray (~`#8A8A8A`)

**Accent color:** `#A81120` (deep red). Used sparingly and only for:
- Logo accent dot
- Primary CTA buttons (Book, Pay, Become a Creator)
- Active/selected state of category pills and tabs
- Small highlight moments (price tags, active nav state)

Never used as a large background fill. Majority of the UI stays dark charcoal + white text so the red reads as deliberate, not decorative.

**Secondary signal color:** green (`#3BD671`) reserved specifically for "live now / available" status — small dot indicators, live badges. Kept separate from the brand accent so it preserves the universal "online now" meaning used across Twitch/Discord.

**Corners:** fully rounded throughout (YouTube-style), no sharp/square corners (explicitly not Twitch's sharper edges). Cards ~12–16px radius, pills/chips fully rounded (999px), buttons rounded.

**Layout patterns:**
- Nav bar: hamburger + logo (left), centered wide search bar with attached search + mic icons (YouTube pattern), actions grouped right (Become a Creator CTA, notifications, avatar)
- Horizontally scrollable category pill row directly under nav
- Horizontally scrollable creator-card shelves for content rows (Live Now, Trending, per-category)
- Creator cards: rounded thumbnail/video preview, name + category, live/available indicator, price per session, rating + session count

**Admin/internal dashboards:** exempt from the dark theme requirement — plain light-mode utility screens are fine since only the operator sees them.

## 5. Logo

Wordmark: lowercase "haibu" + a red accent dot immediately following the final letter (styled like a period, not a separate decorative element). Available in:
- `haibu-logo-dark-bg.svg` — white text, for dark surfaces (primary usage)
- `haibu-logo-light-bg.svg` — near-black text, for light surfaces
- `haibu-logo-short-dark-bg.svg` / `haibu-logo-short-light-bg.svg` — short mark ("h" + accent dot) for mobile headers, favicons, and constrained spaces
- `haibu-icon-mark.svg` — square app-icon version (rounded square, "h" + dot)

Spacing rule: the accent dot sits immediately adjacent to the last letter, no visible gap — verify by rendering, don't eyeball coordinates.

## 6. Platform: responsive web app, not native (v1)

Build a single responsive web app (desktop + mobile browser). No native iOS/Android app for v1.

Reasoning:
- Live video runs fine in-browser via the video SDK; no native requirement for the core loop
- Avoids Apple's 15–30% in-app-purchase cut on digital goods, which would stack on top of platform fee + Stripe fee
- Avoids native app-store content review risk for a live-video platform with an ASMR category
- One codebase, faster iteration
- Native (or a PWA wrapper) is a fast-follow once the core loop and trust/safety are proven

## 7. Homepage structure (v1)

1. **Nav bar** — hamburger, logo, centered search bar, Become a Creator CTA, notifications, avatar
2. **Category pill row** — horizontally scrollable filters (Music, ASMR, Casual Talk, etc.)
3. **Live Now row** — creators currently online/bookable immediately; green live indicator
4. **Trending This Week row** — most-booked creators, social proof through activity
5. **Category shelves** — one horizontal row per category, hand-curated at low creator counts (no algorithmic recommendations in v1)
6. **Trust/social-proof band** — platform-level stats, kept honest and clearly labeled (avoid vague aggregate numbers — see note below)
7. **Become a Creator band** — dedicated section, not just a nav link; supply-side growth is the early bottleneck
8. **Footer** — About, ToS, Privacy, Trust & Safety/Report, Support, Become a Creator, social links

**Note on trust stats:** don't display an unlabeled platform-wide aggregate (e.g. a bare "4.8 avg rating") without context — it's unclear what it represents and can read as invented. If shown, label precisely (e.g. "based on X reviews across all creators") or rely on per-creator rating + session count on each card instead, which is already meaningful without needing a platform-wide framing.

**Explicitly deferred from v1 homepage:** autoplaying hero video/carousel, algorithmic "recommended for you," full "how it works" explainer wall (link out to a separate page instead).

## 8. Tech stack

- **Framework:** Next.js (App Router) + TypeScript, deployed on Vercel
- **Database:** Postgres (via Supabase or Neon)
- **ORM:** Drizzle or Prisma (either is fine — pick one and move on)
- **Auth:** Supabase Auth, Clerk, or Auth.js — email + Google
- **Video calls:** Daily.co (preferred over Twilio for pricing/DX) — hosted WebRTC, must use webhook join/leave telemetry as the source of truth for no-show determination, not self-reporting
- **Payments:** Stripe Connect (Express accounts) for the buyer→platform→creator split and payouts
- **Identity/age verification:** Stripe Identity — required for creator onboarding given the live-video + ASMR-adjacent category
- **Background/delayed jobs:** Inngest or Trigger.dev — needed for booking reminders (24h/1h), timed fund release, and auto-expiring unpaid slot reservations
- **Transactional email:** Resend
- **Media storage:** Cloudflare R2 (no egress fees) or Supabase Storage
- **Styling:** Tailwind CSS + shadcn/ui

**Explicitly out of scope for v1:** Redis, microservices, Kubernetes, native mobile apps, message queues beyond the job tool, self-hosted infrastructure.

## 9. Core data/money rules (non-negotiable)

- **Money stored as integer cents**, never floating point
- **Real platform take rate** — target 15–20% on sessions (industry comps: Superpeer ~10%, Cameo ~25%, Preply 18–33%). Never launch with a rate that doesn't clear Stripe's own processing fee (~2.9% + $0.30)
- **Append-only transaction ledger table**, separate from the bookings table, as the source of truth for money movement and reconciliation
- **Availability/slot model** must support real bookable datetimes with concurrency protection (unique constraint on creator+time for active bookings, short-lived slot reservation during checkout) — not just recurring weekly-window strings
- **No-show determination** tied to actual video-SDK room-join telemetry, not a self-reported button
- **Session offerings** (fixed duration + fixed price) live on their own entity per creator, not as a loose price field on the profile

## 10. v1 scope — in vs. deferred

**In v1:**
- Auth, creator onboarding (profile, offerings, Stripe Connect + Identity)
- Discovery: browse grid, category filter, search
- Booking with instant confirmation and concurrency-safe slot locking
- Live video call (Daily.co), timer, auto-end
- Money handling: cents, real take rate, ledger
- No-show + tiered cancellation, telemetry-based
- Post-session rating
- Report + block, bare-bones admin (list reports, suspend, force-cancel-with-refund)
- Email reminders (confirmation, 24h, 1h)
- Legal pages (ToS, Privacy, Refund, content policy)

**Deferred to v1.1+:**
- Tipping (separate payment flow — add once there's a repeat-buyer base)
- In-app notification center (email covers v1)
- Rescheduling (cancel + rebook is sufficient for v1)
- Elaborate trust-signal dashboards / reliability scores (show simple rating + session count only)
- Automated suspension thresholds (manual admin review at launch scale)
- Native mobile app / PWA wrapper
