# Haibu — Review & Rating System Spec

> Feature-first document grounded in research on Airbnb, Preply, and iTalki — the three most relevant reference platforms for a paid, 1-on-1 session marketplace. Build nothing without reading Section 1 first.

---

## 1. What the research actually showed (and what Haibu should take from it)

### Airbnb
- Double-blind system: neither party sees the other's review until both submit or a 14-day window closes. Simultaneous publication prevents retaliatory reviews.
- Both parties (guest AND host) always review each other — mutual accountability, not one-way.
- Once submitted, reviews are locked. No editing after publication.
- An overall star rating drives everything visible publicly; subcategory ratings exist but are secondary.
- The review window opens at checkout (session end), not at booking.

**What Haibu takes from this:** the double-blind timing model and mutual accountability (both guest AND creator review each other) are exactly right for a platform where trust between strangers is the core product. The 14-day window fits a multi-session context; Haibu's 1-on-1 single-session context probably warrants something shorter — 7 days is enough, and a shorter window means fresher, more accurate impressions.

### Preply (tutoring marketplace)
- Primary review: a single overall rating (1-5 stars) left immediately after a lesson.
- Subcategory ratings: once per month, optionally, students rate four specific dimensions (explanation clarity, skill support, lesson structure, encouragement/patience). Optional and capped at monthly frequency — the cap prevents subcategory-fishing and keeps it feeling light rather than burdensome.
- Subcategory scores are separate from the overall rating and serve a different purpose: helping prospective students differentiate between tutors with similarly high overall scores.
- Reviews are publicly visible on the tutor's profile.

**What Haibu takes from this:** subcategory ratings are genuinely useful for a market where many creators might cluster near 4.5–5 stars (the compressed scale problem), but making them optional prevents rating fatigue. The specific categories Preply uses (clarity, support, structure, patience) map well but need adapting for entertainment categories vs. tutoring. For ASMR and casual talk, "preparation/structure" matters less; "authenticity," "connection," and "relaxing presence" matter more.

### iTalki
- Simple, fast review prompt immediately after session completion — no friction.
- Reviews visible on tutor profile.
- No subcategory complexity in the core flow — keeps the primary experience clean.
- Strong emphasis on making session history easily browsable (the point you flagged: a guest can't currently see their past sessions in Haibu to rate them).

**What Haibu takes from this:** the "session history is the review entry point" design is actually more important than the review form itself. If a guest can't easily see that they had a completed session and navigate to rate it, reviews simply don't happen at volume. The booking history page is the primary review surface, not a "go leave a review" email link.

---

## 2. The gap Raghav identified (the most important part of this doc)

**A guest currently has no way to see their past sessions at all.** There is no "my sessions" or "my bookings" history screen on the guest/fan side — only the dashboard (which only shows upcoming sessions, filtered to `end_at >= now`). The dashboard was explicitly designed to show *upcoming* things, not history. A completed session disappears from it correctly, which means it disappears entirely from the guest's view, with no place to go review it. This isn't just a review problem — it's a fundamental UX gap: a guest who wants to book the same creator again, or check what they paid for, or leave a review, currently has no path to do any of those things.

**The fix isn't "add a review button somewhere." It's "build a session history screen for guests."** Reviews live inside that screen, not the other way around.

---

## 3. Session history screen (new, required before reviews exist)

### Route
`/bookings` — accessible from the NavBar avatar dropdown ("My sessions") for any logged-in user who has at least one booking as a guest.

### What it shows
A chronological list (most recent first) of all bookings where the user is the guest, across all statuses. Each entry shows:
- Creator name + avatar
- Offering title + duration
- Session date and time (formatted same as the booking-detail page — "Aug 12, 2026 · 1:30 – 2:00 PM")
- Status badge (Completed / Upcoming / Cancelled / Expired)
- Price paid
- A "Review" pill/button (only on `completed` bookings that haven't been reviewed yet — explained in Section 4)
- A "Book again" link (for completed bookings — links to that creator's profile)

### Empty state
"No sessions yet — browse creators" with a link to `/`.

### Filter tabs (optional for v1, but valuable)
- All / Upcoming / Past

---

## 4. Review flow — guest side

### Trigger
A guest sees a "Leave a review" prompt in two places:
1. **Session history screen** — a clearly visible "Review" pill on any `completed`, unreviewed booking row (the primary surface, highest intent).
2. **Booking detail page** — a review card shown at the bottom of `/bookings/[id]` when the booking is `completed` and unreviewed (already partly built in Step 12, but needs the session history as the discovery path).

No email-only trigger — email can be a nudge (Step 14), but the in-app surface is the primary one.

### Window
7 days after `end_at`. After that, no review possible for that session. The "Review" pill changes to "Review period expired" (muted text, no action) once the window closes. This is intentional — impressions decay and late reviews become less accurate.

### The review form
Simple, low-friction, fits on one screen without scrolling:

**Step 1 — Overall star rating** (required)
Five large, tappable stars. No labels needed — stars are universally understood. Selected state: filled accent color. Unselected: outline only.

**Step 2 — Short text** (optional, max 500 characters)
A real Textarea (already built in Step 12) with a soft character counter appearing below 100 characters remaining. Placeholder copy varies by category:
- Casual Talk: "How was the conversation? What made it memorable?"
- ASMR: "How did the session feel? What stood out?"
- Music: "How was the lesson? What would you tell someone considering booking?"

**Step 3 — Category-specific reaction tags** (optional, select all that apply)
Small pill-shaped tags, multi-select, pre-defined per category:

*ASMR:* Incredibly relaxing · Great voice · Felt personal · Very creative · Perfect pacing · Helped me sleep

*Casual Talk:* Great conversationalist · Easy to talk to · Made me laugh · Very genuine · Interesting topics · Good listener

*Music:* Clear explanations · Patient teacher · Pushed me to improve · Good energy · Well prepared · Fun session

These are one-tap signals that require zero writing, lower the barrier for guests who won't write text, and give creators actionable feedback about what specifically landed. They also give the public profile richer signal than a star average alone.

**Submit button**
"Submit review" (primary, accent fill). Disabled until at least the star rating is set. On submit: brief "Thank you — your review has been shared with [Creator name]" confirmation state, then the button changes to "Reviewed ✓" permanently on that booking row.

### Double-blind timing
Reviews are written immediately but **not shown publicly until either the creator also submits their review of the guest, or 48 hours have passed** — whichever comes first. 48 hours (not 14 days like Airbnb) because sessions are short and impressions are fresh; a shorter window keeps the feedback loop tight. This prevents retaliatory reviews without making either party wait a week to see their feedback. After 48 hours, any submitted-but-waiting reviews publish automatically.

---

## 5. Review flow — creator side

### Trigger
A creator sees a "Review this guest" prompt on their `/creator/bookings` page, on any `completed` booking that hasn't been creator-reviewed yet, within the same 48-hour window.

### The creator review form
Simpler than the guest form — creators are reviewing a person, not an experience:

**Step 1 — Thumbs up / Thumbs down** (required, binary)
Not stars. The question a creator is really answering is "would I accept a booking from this person again?" Binary is faster, more accurate, and less likely to cause creator anxiety about how a number will affect the guest. (Airbnb uses stars for hosts reviewing guests; Preply uses thumbs. For Haibu's entertainment context, thumbs is the right call.)

**Step 2 — Private note to the platform** (optional, never shown publicly)
If the creator gives a thumbs down, they see a brief free-text field: "What happened? (Only Haibu sees this.)" This is the safety valve — a creator can flag a problem without it being public and potentially retaliatory.

**Creator reviews are never shown publicly.** They exist for two platform purposes only: (1) informing a future creator if a guest has a history of thumbs-down interactions (an optional "flag on this guest" that a creator could see before accepting a repeat booking, v2 feature), and (2) giving platform admins signal about guests who might be violating community guidelines.

---

## 6. What displays publicly on the creator profile

### The star rating
The aggregate average of all public guest reviews (1-5), shown to one decimal place. Number of reviews shown in parentheses: "4.8 (23 reviews)." The rating only appears once there are at least 3 reviews — before that, show "New creator" or nothing, to avoid a single early review distorting the displayed average.

### Review cards
The 10 most recent published guest reviews, each showing:
- Guest first name + avatar initial (not full name — privacy)
- Star rating (as filled/outline star row, not just a number)
- Text (if provided)
- Reaction tags (if provided, shown as small pills)
- Date ("3 weeks ago" relative format, not a specific date — feels warmer)

### Reaction tag summary
Above the individual review cards, a small tag-cloud showing the top 3-5 reaction tags from across all reviews for this creator, with a count: "Incredibly relaxing (12) · Felt personal (8) · Great voice (6)." This is genuinely more scannable than reading individual reviews for a first impression.

---

## 7. Schema changes needed (all additive, no existing tables touched)

The `reviews` table already exists from Step 12. The following columns need to be added or confirmed:

```sql
-- Existing: id, booking_id, reviewer_id, rating (int), text, created_at
-- Add:
ALTER TABLE reviews ADD COLUMN tags text[] DEFAULT '{}';
ALTER TABLE reviews ADD COLUMN is_public boolean DEFAULT false NOT NULL;
ALTER TABLE reviews ADD COLUMN published_at timestamptz;
-- Creator-side review (separate from public guest review):
ALTER TABLE reviews ADD COLUMN reviewer_role text NOT NULL DEFAULT 'guest'; -- 'guest' or 'creator'
ALTER TABLE reviews ADD COLUMN creator_sentiment text; -- 'positive' or 'negative', only for creator reviews
ALTER TABLE reviews ADD COLUMN creator_private_note text; -- never public
```

And a scheduled job (Inngest) to flip `is_public = true` / set `published_at = now()` after 48 hours if not already published.

---

## 8. v1 vs deferred

### v1 (build now)
- Session history screen for guests (`/bookings`)
- Guest review form: star rating + optional text + optional reaction tags
- Creator review form: thumbs + optional private note
- Double-blind 48h window with auto-publish
- Reaction-tag summary on creator profile
- "New creator" guard (no rating shown until 3 reviews)
- "Book again" link from session history

### Explicitly deferred (v2)
- Guest's past-booking signal visible to creators before accepting a repeat booking
- Flagging a guest based on creator thumbs-down history
- Review responses from creators (public reply below a guest's review)
- Sorting/filtering reviews on profile (by recency, by rating)
- Review analytics for creators (in Creator Studio — "your average last 30 days")
