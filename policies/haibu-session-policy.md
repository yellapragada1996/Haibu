# Haibu — Session Policy (Single Source of Truth)

> This document governs every money, cancellation, no-show, and dispute decision in the app. If the code contradicts this document, the code is wrong. Every edge case is covered. Every scenario has exactly one outcome. No ambiguity.

> **Terminology note:** this document and all user-facing copy use "Guest." The underlying database schema and internal code deliberately keep "fan" (`fan_id`, `cancelled_fan`, etc.) — this was an established decision earlier in the build and is not an inconsistency. Nothing here requires a schema rename.

---

## 1. Core principles

1. **Guests are protected by default.** A guest paid money to experience a creator's time. If they don't get what they paid for, they get their money back. Period.
2. **Creators are paid only for sessions they genuinely delivered.** Showing up for 1 minute of a 30-minute session is not delivery. Joining a call and immediately leaving is not delivery.
3. **The platform takes its fee whenever the creator fulfilled their commitment** — showed up and was genuinely available for the session — regardless of whether the guest attended. If the creator did not fulfill their commitment, neither the creator nor the platform earns anything.
4. **Creator-initiated cancellation always means full refund.** No exceptions, no partial refunds, no "but they cancelled because of a good reason." The guest's experience is the same regardless of the reason.
5. **Simplicity over cleverness.** A policy guests and creators can understand in 30 seconds is worth more than one that's technically optimal but confusing.

---

## 2. The session lifecycle (what statuses exist and what they mean)

| Status | Meaning | Money state |
|---|---|---|
| `reserved` | Slot is held, payment is processing | Payment captured but not settled to creator |
| `expired` | Reservation abandoned — payment never completed. Nothing happened. | No charge, no payout |
| `confirmed` | Payment succeeded, session is scheduled | Guest has been charged, creator payout is pending |
| `completed` | Both parties joined and the session met the minimum presence threshold | Creator payout scheduled (after hold period) |
| `no_show_fan` | Guest never joined | Creator receives full payout (they showed up and waited) |
| `no_show_creator` | Creator never joined | Guest receives full refund |
| `cancelled_guest` *(code: `cancelled_fan`)* | Guest cancelled before the session | Refund amount depends on when (Section 3) |
| `cancelled_creator` | Creator cancelled before the session | Guest receives full refund, always |
| `cancelled_admin` | Platform cancelled (dispute resolution) | Refund or payout per admin decision |

---

## 3. Guest cancellation policy

Simple, time-based, no exceptions.

| When the guest cancels | What happens |
|---|---|
| More than 24 hours before session start | Full refund. No questions asked. |
| Within 5 minutes of booking, regardless of time-to-session | Full refund (cooling-off grace period — protects against accidental bookings or immediate regret) |
| Between 24 hours and 2 hours before | 50% refund. Creator receives the other 50% as compensation for lost time. |
| Less than 2 hours before session start | No refund. Creator receives full payout. |
| After session start time | No refund. Session is considered started. |

**Why these thresholds:** 24 hours gives a creator enough notice to potentially fill the slot. 2 hours is the point after which a creator has likely already adjusted their day around the session. Inside 2 hours, the creator's time is essentially committed. **This is a deliberate choice of 2 hours over a shorter 1-hour window — the extra hour gives creators more real, usable notice, and matches this document's own principle that creators should only bear cost for time they didn't actually have a fair chance to reclaim.**

**Platform fee on partial/no refund:** Haibu's platform fee is deducted from whatever the creator receives. If the guest gets a 50% refund, the creator receives 50% minus the platform fee on that 50%. If the guest gets no refund, the creator receives the full amount minus the platform fee.

---

## 4. Creator cancellation policy

**Always a full refund. No tiers, no exceptions.**

If a creator cancels a confirmed session at any time, for any reason, the guest receives a 100% refund. The creator receives nothing. Haibu receives nothing.

**Why no tiers for creators:** the guest's experience of a cancelled session is the same whether the creator cancels 48 hours before or 5 minutes before. They blocked time, planned for it, and got let down. Full refund is the only response that maintains guest trust.

**Repeated creator cancellations or no-shows:** if a creator accumulates 3 or more events in a rolling 30-day period — where an "event" is a genuine creator-initiated cancellation (`cancelled_creator` with `cancelled_by` set to the creator, not `'system'`) OR a real no-show (`no_show_creator`) — this is **flagged for admin review**, not automatically unpublished. A no-show counts here specifically because it's a worse guest experience than a cancellation with warning — a guest left waiting with no explanation is a stronger reliability signal than one who was told in advance. Given known webhook reliability edge cases, an automated unpublish action carries real risk of penalizing a creator for something outside their control. An admin reviews the flagged account and decides whether to unpublish, warn, or take no action. Mutual no-shows (`cancelled_by: 'system'`, Section 5) never count toward this threshold — only events genuinely caused by the creator do.

---

## 5. No-show, late arrival, and early departure — one unified rule

**This section replaces separate flat-time rules with a single proportional model, because a flat "5 minutes" or "15 minutes" threshold means wildly different things for a 15-minute session versus a 60-minute session. Everything below scales to the session's actual booked duration.**

### The rule

- **Grace period:** the greater of **2 minutes** or **10% of the session's scheduled duration** — applies at both the start and end of a session, and to reconnects (see below). No penalty within this window.
- **Beyond the grace period:** a **fully continuous proportional refund** — the refund percentage always equals the percentage of the session's scheduled duration that went undelivered, with no cap, no cliff, no jump, all the way up to a true no-show (100% missed = 100% refund). A creator who is 49% late is refunded 49%. A creator who is 90% late is refunded 90%. Every additional minute a creator stays always earns them more — there is deliberately no threshold past which "just don't bother showing up" becomes the better outcome than showing up late and doing what they can.

**The grace period is a forgiveness threshold, not a credit.** Once a creator is beyond the grace period, the refund is based on the *full* time actually missed — the grace period itself is not subtracted from that calculation. Example: a creator who joins 1 minute before a 30-minute session ends missed 29 of 30 minutes (97%), and the refund is 97% — not `97% − 10% grace = 87%`. Staying inside the grace period forgives lateness entirely (0% refund); the moment a creator is even one second past it, the full missed duration counts. This creates a small, harmless jump right at the grace boundary itself (0% to roughly the grace percentage) — that's an intentional, minor forgiveness edge, not the punishing cliff removed above.

**Why no cliff, on purpose:** an earlier draft of this policy used "more than 50% missed = full no-show" as a hard cutoff. That created a real bad incentive — a creator approaching the 50% mark had a rational reason to simply not join at all, since a 51%-late arrival paid exactly the same (zero) as never showing up. Removing the cliff removes that incentive entirely. Money and status are now separate questions (see "Status vs. refund" below).

### Status vs. refund — two different questions, decoupled on purpose

The refund percentage (above) is always continuous. But the booking's **status label** — which determines whether a review can be left, and whether this counts toward a creator's reliability threshold — still uses a discrete line: **more than 50% of the session missed** gets labeled `no_show_creator` / `no_show_fan` for tracking purposes, even though the refund itself was already computed continuously and never jumped. A session at 51%-missed and a session at 100%-missed are both labeled the same way for tracking, but the guest in the 51% case still only gets a 51% refund, not 100%. Status answers "should this be reviewable / does this count toward reliability tracking." Refund percentage answers "how much money moves." They don't have to agree on where their lines sit.

### What counts as "joining" and "leaving"

A participant is "joined" from the first `participant.joined` webhook for their session. A participant is "left" at their final `participant.left` webhook before the session's scheduled end. **A disconnect followed by a reconnect within the same grace-period window (the greater of 2 minutes or 10% of scheduled duration) does not count as leaving** — the gap is ignored entirely, treated as if they were present throughout. This uses the identical grace formula as arrival/departure, not a separate flat value — a fixed 5-minute reconnect window would be a third of a 15-minute session but a twelfth of a 60-minute one, which contradicts this section's own premise that nothing here should be a flat, non-scaling number. Only a disconnect that exceeds the grace window, or one with no reconnect before the session ends, starts counting as time undelivered from that point.

### Creator-side application

| Scenario | Refund | Status label (tracking only) |
|---|---|---|
| Creator arrives within the grace period | No penalty | `completed` |
| Creator arrives after the grace period, up to 50% of session missed | Proportional refund equal to % of time missed | `completed` |
| Creator arrives after more than 50% of the session would already be over | Proportional refund equal to % of time missed (continues, no cap) | `no_show_creator` (tracking/review-eligibility only — refund is still proportional, not 100%, unless they truly never joined) |
| Creator never joins at all | 100% refund (100% missed) | `no_show_creator` |
| Creator leaves before the grace period at the end | Proportional refund for the remaining time, same rule | `completed` or `no_show_creator` depending on % missed, per the row above |
| Creator leaves within the grace period of the scheduled end | No penalty | `completed` |

**The session does not extend** to compensate for a late start — the scheduled end time stays fixed regardless of when the creator actually joined, unless the creator voluntarily chooses to stay later as a courtesy (not enforced, not expected).

### Guest-side application

**Guest no-show (guest never joins):** creator receives full payout. The creator showed up and made themselves available for the full scheduled window — that is their commitment fulfilled, regardless of whether the guest used the time.

**Guest arrives late or leaves early:** no refund adjustment. The guest's own late arrival or early departure is their own choice and does not affect what the creator is owed. The creator delivered their side.

### Neither party joins

Refund the guest in full (nobody delivered anything to justify a charge), but classify this explicitly as a **mutual no-show** — distinct from a genuine creator-initiated cancellation. **Concrete representation, no schema change needed:** `status: cancelled_creator`, `cancelled_by: 'system'`, `cancel_reason: 'mutual no-show'`. **The reliability-threshold query (Section 4) must explicitly exclude any row matching this exact combination** (`cancelled_by = 'system'` AND `cancel_reason = 'mutual no-show'`) — only rows where a creator actively initiated the cancellation count toward the 3-strikes threshold. Defaulting blame to the creator when both parties failed to show up is asymmetric and unfair — the guest is equally responsible for the outcome.

---

## 6. Technical failures

### The video call fails to connect (neither party's fault)

If the Daily.co platform has an outage or both parties cannot connect despite trying:
- Guest receives a **full refund**
- Creator receives nothing (but is not penalized — this doesn't count toward the 3-cancellation reliability threshold)
- Admin review required to confirm it was a genuine technical failure, not a party just not trying

### One party can connect but the other can't

This is harder to adjudicate automatically. The default policy:
- If the creator is connected and waiting but the guest can't connect: treated as a **guest no-show** after the join window expires (creator gets paid)
- If the guest is connected but the creator can't connect: treated as a **creator no-show** (guest gets refund)
- Either party can dispute this if they believe the issue was platform-side, not their own connection

---

## 7. Payout timing

Creators are not paid instantly. Payouts are held for a review period.

| Creator's completed session count | Hold period |
|---|---|
| Fewer than 5 completed sessions | 7 days |
| 5 or more completed sessions | 96 hours (4 days) |

**Why a hold period:** the hold's primary purpose is the 72-hour guest dispute window (Section 8) — it guarantees a dispute always has time to surface and be actioned before money is irreversibly released. It does not, and cannot, fully protect against a card-network chargeback, which can technically arrive up to ~120 days after a charge — no realistic hold period stops that. The hold period starts from the moment the session is marked `completed`, not from when it was scheduled.

**Why 96 hours specifically, not 72:** the guest dispute window (Section 8) is 72 hours. If the payout hold were also exactly 72 hours, a dispute filed near the deadline could lose the race against an already-released payout. 96 hours guarantees a full 24-hour buffer after the dispute window closes before any established creator's payout releases. The 7-day new-creator hold already has ample margin over the 72-hour dispute window and needs no change.

**What happens during the hold:** the payout is scheduled but not released. If a dispute or chargeback arrives during the hold, the payout is cancelled and the funds are returned to the guest. If the hold period passes with no dispute, the payout is released to the creator's Stripe Connect account automatically.

---

## 8. Dispute resolution

### Guest disputes

A guest can dispute a session within **72 hours** of the session's scheduled end time. After that, the evaluation is final.

Disputes are reviewed by an admin. Possible outcomes:
- **Full refund** (creator receives nothing)
- **Partial refund** (proportional, based on the situation)
- **No refund** (dispute rejected, original evaluation stands)

### Creator disputes

A creator can dispute a no-show or cancellation evaluation within **72 hours**. The most common case: a creator claims they were present but the webhook didn't fire (known edge case with Daily's webhook delivery).

Admin reviews the Daily room logs, participant records, and any evidence the creator provides. If the admin confirms the creator was genuinely present, the evaluation can be overridden from `no_show_creator` to `completed` via the admin panel's no-show override (already built).

---

## 9. Edge cases explicitly resolved

| Scenario | Outcome |
|---|---|
| Guest books and cancels within 5 minutes of booking | Full refund regardless of time-to-session (cooling-off grace period) |
| Creator joins 1 minute before a 30-minute session ends | 29 of 30 minutes undelivered (97%) → refund proportional to time missed (97%), and separately labeled `no_show_creator` for tracking since >50% was missed |
| Creator joins, stays 6 minutes, leaves a 30-min session | 24 of 30 minutes undelivered (80%) → 80% refund, and separately labeled `no_show_creator` for tracking since >50% was missed |
| Guest joins, creator joins, both stay the whole time | Completed. Creator receives full payout after hold period. |
| Guest joins, creator joins, guest leaves after 5 minutes | Completed from the creator's side — the creator fulfilled their commitment. No refund; guest's own choice to leave. |
| Guest books a session starting in 10 minutes, creator cancels | Full refund. Same as any creator cancellation. |
| Guest books a session, loses internet mid-call | No refund. Technical issues on the guest's side are the guest's responsibility. The creator was present. |
| Creator's internet drops mid-call and they rejoin within the grace window | No penalty — reconnect within the grace window is ignored entirely. |
| Creator's internet drops and they never rejoin | Treated as leaving from the point of disconnection; the proportional refund rule (Section 5) applies from there. |
| Both parties join but nobody talks (awkward silence for 30 minutes) | Completed. The service was delivered (creator was present and available). Quality of conversation is not something the platform adjudicates. |
| Guest books 5 sessions with the same creator and cancels all of them last minute | No platform-level penalty for guests. The creator can block a repeat-cancelling guest after repeated pattern (already built). |
| Creator raises their price after a guest has already booked | The booked price is locked. Price changes only apply to future bookings. |
| Session runs past the scheduled end time because both parties are enjoying it | No additional charge. The creator chose to extend. This is a positive experience, not a billing event. |
| Neither party joins a 15-minute session | Guest refunded in full, classified as mutual no-show — does not count against the creator's reliability threshold. |

---

## 10. What the code must enforce vs. what admins handle manually

### Automated (code enforces, no human needed)
- Guest cancellation refund tiers (Section 3)
- Creator cancellation → full refund (Section 4)
- Proportional no-show / late-arrival / early-departure evaluation (Section 5)
- Payout hold period calculation (Section 7)
- 5-minute cooling-off refund for immediate post-booking cancellation

### Semi-automated (code flags, admin confirms)
- Creator reliability threshold (3+ cancellations in 30 days → flagged for admin review, not auto-unpublished)
- Any evaluation where a session lands near the 50%-missed status-label threshold (Section 5) and webhook timing looks ambiguous — refund math is unaffected either way, but the `no_show` label affects review-eligibility and reliability tracking, so a borderline case is worth a human glance

### Manual (admin-only)
- Dispute resolution (Section 8)
- Technical failure determination (Section 6)
- No-show overrides (already built in admin panel)
- Any exception to this policy

---

## 11. What this policy does NOT cover (and why)

- **Rescheduling:** not in v1. A cancellation + rebooking is the current workaround. Adding reschedule as a first-class feature is a v2 item.
- **Subscription/package pricing:** not in v1. Each session is individually priced and booked.
- **Tipping:** not in v1. The session price is the full price.
- **Quality disputes** ("the session was bad"): the platform does not adjudicate quality. If a creator was present for the full session, the session is completed. Quality feedback is captured through the review system, not the refund system.
- **Chargebacks initiated directly through the guest's bank:** these are handled by Stripe's chargeback process, not this policy. Haibu responds to chargebacks with session evidence (join timestamps, duration).
