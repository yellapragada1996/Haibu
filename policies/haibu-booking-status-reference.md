# Haibu — Booking Status Reference (Single Source of Truth)

> This document is the authoritative reference for every booking **state**, the **facts** that sit alongside it, the **views** the UI derives from it, and the **labels** shown to guests and creators. If code contradicts this document, the code is wrong.
>
> It supersedes the lifecycle table in `haibu-session-policy.md §2`, which listed only eight statuses and omitted `expired`.

> **Terminology note:** this document and all user-facing copy use "Guest." The database schema and internal code deliberately keep "fan" (`fan_id`, `cancelled_fan`, `no_show_fan`, `cancel_actor.fan`). This is an established decision, not an inconsistency, and nothing here requires a schema rename.

---

## 1. The four layers — and why they must never collapse

There are four distinct concepts. Confusing them is the root cause of every booking-state bug.

1. **Status** — the single `bookings.status` enum. Exactly 9 values, mutually exclusive, one true value at a time. *Truth.*
2. **Facts** — orthogonal fields that sit alongside status: `needs_review`, `cancelled_by`, `cancel_reason`, and the timestamps (`fan_joined_at`, `creator_joined_at`, `reservation_expires_at`, `payout_eligible_at`, `effective_payout_cents`). *They refine status; they never replace it.*
3. **Views** — computed UI groupings that are **never stored**: "Upcoming", "Past", the "Cancelled" badge group. They combine status + facts + time.
4. **Labels** — the user-facing pill text. Always derived from **status + facts**, never from a view, and never from a single status value alone when `cancelled_by` disambiguates it.

> **Rule 0:** a badge is a function of `(status, facts, viewer-role)`. It is never a function of the Upcoming/Past view, and it is never a hardcoded status string copied screen by screen.

---

## 2. Status — the complete 9-state enum

`booking_status` in `schema.ts`:

| Status | Meaning | Terminal? |
|---|---|---|
| `reserved` | Slot held; payment is processing | No |
| `confirmed` | Payment succeeded; session is booked | No |
| `completed` | Session delivered (creator met the presence threshold) | Yes |
| `expired` | Reservation abandoned — payment never completed. Nothing happened. | Yes |
| `cancelled_fan` | Guest cancelled before the session | Yes |
| `cancelled_creator` | Creator cancelled, **or** a mutual no-show (see `cancelled_by`) | Yes |
| `cancelled_admin` | Platform cancelled (dispute / force-cancel) | Yes |
| `no_show_fan` | Guest never joined | Yes |
| `no_show_creator` | Creator never joined (full miss) | Yes |

> `cancelled_creator` is the one deliberately overloaded value: it means either a real creator cancellation (`cancelled_by = 'creator'`) or a mutual no-show (`cancelled_by = 'system'`). The UI label differs, which is why §6 disambiguates on `cancelled_by`.

---

## 3. Transition rules

Every legal move, its trigger, and its guard. Anything not listed here is not a valid transition.

| From | To | Trigger | Guard / note |
|---|---|---|---|
| `reserved` | `confirmed` | Stripe `payment_intent.succeeded` | Creates ledger + room |
| `reserved` | `expired` | Stripe `payment_intent.payment_failed` / `.canceled`; reservation timeout sweep; checkout cleanup | Guarded on `status = 'reserved'` |
| `confirmed` | `cancelled_fan` | Guest cancels | Guarded on `status = 'confirmed'`; sets `cancelled_by = 'fan'` |
| `confirmed` | `cancelled_creator` | Creator cancels | Guarded on `status = 'confirmed'`; sets `cancelled_by = 'creator'` |
| `confirmed` | `cancelled_admin` | Admin force-cancel | Idempotent, guarded on current status |
| `confirmed` | `completed` | Session evaluation: both joined / creator delivered | Sets payout hold |
| `confirmed` | `no_show_fan` | Session evaluation: guest didn't join | Creator still paid |
| `confirmed` | `no_show_creator` | Session evaluation: creator full no-show | Full refund; `cancelled_by = 'system'` |
| `confirmed` | `cancelled_creator` | Session evaluation: mutual no-show (neither joined) | `cancelled_by = 'system'`, `cancel_reason = 'mutual no-show'` |
| `no_show_fan` | `completed` | Admin override | Only `no_show_fan` is override-able without re-charging |
| `no_show_fan` | `cancelled_admin` | Admin dispute refund | Full refund |
| *any* `needs_review = true` | `cancelled_admin` | Admin resolves with **refund** | Full refund; `cancelled_by = 'admin'`, `needs_review = false` |
| *any* `needs_review = true` | **unchanged — stays `no_show_fan`** | Admin resolves with **pay_full** or **pay_reduced** (partial payout) | `needs_review = false`, `effective_payout_cents` set; **status does not move** |

**Special case — `completed` + partial delivery:** the evaluation job auto-issues a proportional refund and leaves `status = 'completed'` (with `effective_payout_cents` set, `needs_review = false`). This does **not** change status.

**Invariant:** `expired`, `cancelled_*`, and `no_show_*` are terminal except for the admin overrides and `needs_review` resolution listed above. `reserved` and `confirmed` are the only non-terminal states.

---

## 4. Facts (orthogonal fields)

| Field | Type | Meaning |
|---|---|---|
| `needs_review` | boolean | True only for the one ambiguous case: **guest never showed AND the creator was partially present** (present > 0 but missed more than the grace window). It is a money-adjudication hold, not a status. |
| `cancelled_by` | `cancel_actor` enum (`fan` \| `creator` \| `admin` \| `system`) | **Who** cancelled. This is a role enum, **not a user ID**. |
| `cancel_reason` | text | Human-readable reason (e.g. `'mutual no-show'`, `'guest cancelled (50% refund)'`). |
| `fan_joined_at` / `creator_joined_at` | timestamp | Presence facts used by the no-show evaluation. |
| `reservation_expires_at` | timestamp | Deadline for a `reserved` slot to become `expired`. |
| `payout_eligible_at` | timestamp | When the creator's payout hold ends. |
| `effective_payout_cents` | int | Actual payout after a proportional refund; `NULL` = no adjustment. |

> `needs_review` is not a status and must never be written into the `status` column. It can co-exist with `no_show_fan` (which is the only status it is ever set on today).

---

## 5. Views (computed, never stored)

| View | Definition |
|---|---|
| **Upcoming** | `end_at >= now` AND (`status = 'confirmed'` OR (`status = 'reserved'` AND `reservation_expires_at > now`)) |
| **Past** | Everything that is not Upcoming |
| **Cancelled** badge group | `status IN ('cancelled_fan', 'cancelled_creator', 'cancelled_admin')` — one consistent muted badge |

> A booking can move between Upcoming and Past purely because time passed, with **no status change**. That is exactly why the badge must not be derived from these views.

---

## 6. Labels — what the guest and creator see

Labels are derived from **status + facts + viewer role**. Two statuses split on `cancelled_by`, and `needs_review` overlays one side only.

| DB status (+ facts) | Guest sees | Creator sees |
|---|---|---|
| `reserved` | "Processing" | "Processing" |
| `confirmed` | "Confirmed" | "Confirmed" |
| `completed` | "Completed" | "Completed" |
| `expired` | *(hidden from the main list; if shown: "Not completed", muted)* | *(hidden)* |
| `cancelled_fan` | "You cancelled" | "Guest cancelled" |
| `cancelled_creator` + `cancelled_by = 'creator'` | "Creator cancelled" | "You cancelled" |
| `cancelled_creator` + `cancelled_by = 'system'` | "Session didn't happen" | "Session didn't happen" |
| `cancelled_admin` | "Cancelled by Haibu" | "Cancelled by Haibu" |
| `no_show_fan` | "You missed this" | "Guest didn't join" |
| `no_show_creator` | "Creator didn't join" | "You missed this" |
| *any* + `needs_review = true` | *(unchanged — the guest still sees their underlying status label, e.g. "You missed this")* | "Under review" |

### The three corrections, stated as rules

1. **The badge always derives from status + facts, never from the Upcoming/Past view.** (Today `confirmed` is wrongly rendered as "Upcoming"; that's a view leaking into a label.)
2. **`cancelled_admin` is "Cancelled by Haibu" on both sides.** Refund status is a **separate money fact** — never implied by the pill, never baked into the label.
3. **"Under review" is creator + admin facing only.** When `needs_review = true`, the creator's pill becomes "Under review" (overriding the underlying status); the **guest always sees their real underlying status** (`no_show_fan`, etc.) regardless of review state.

---

## 7. Non-negotiables

1. One column (`status`), 9 values. Nothing else is ever written to it.
2. Facts refine status; they never replace it.
3. Views are computed at read time and never persisted.
4. Labels are pure functions of `(status, facts, viewer-role)`.
5. `cancelled_creator` alone is ambiguous — always pair it with `cancelled_by` before rendering.
6. Refund / payout state is a money fact, shown separately from the session-status pill.
