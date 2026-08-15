# Haibu — Availability Configuration Spec (Creator Studio, Availability tab)

> Authoritative for the Availability tab rebuild. Read fully before writing code. This resolves both open questions from discussion: (1) shared vs. per-offering availability, (2) how to make configuration genuinely easy — grounded in how Calendly, Cal.com, and Topmate solved the same problem, not invented from scratch.

---

## 1. The core semantic decision: ONE shared weekly schedule per creator, applied to ALL offerings

**Decision: v1 does not support per-offering availability ("ASMR only Wednesdays, music only Thursdays"). A creator sets one weekly availability pattern; every active offering is bookable within it, filtered only by that offering's own duration.**

### Why, with evidence

- **This is already how the schema works.** `availability_windows.creator_id` — there is no `offering_id` on that table. Building per-offering availability would mean an actual schema change, not just a UI change. Keeping it shared costs nothing extra to build; changing it would be new scope.
- **Every real competitor defaults to exactly this.** Calendly calls it a "Schedule" — one reusable weekly-hours block that gets assigned to event types, with the default being everything shares it. Cal.com: same concept, one default schedule connected to all event types out of the box. Topmate explicitly supports per-service schedules, but frames it as an advanced option layered on top of a default shared setup, not the starting flow. Three independent products arrived at the same default — that's a strong signal, not a coincidence.
- **It's dramatically simpler for the creator.** A creator with 3 offerings configuring 3 separate weekly calendars is 3x the setup burden, directly against the "make it as easy as possible" goal. One schedule, set once, is the entire mental model: "here's when I'm generally free" — separate from "here's what someone can book during that time," which is what offerings + their durations already handle.
- **It still produces correct, useful slots.** The Step 5 algorithm already combines windows + an offering's duration to produce that offering's specific bookable slots — this works identically whether the creator has one offering or five, with zero change needed to that logic.

### What this means concretely
- A creator has exactly one set of `availability_windows` + `availability_blocks`.
- On their public profile, when a fan selects "Guitar Lesson" (30 min) vs. "Deep Dive Session" (60 min), the same underlying windows generate different slot grids per offering, purely because of duration — not because the creator configured them separately.
- **Explicitly deferred, not forgotten:** a "different schedule per offering" feature is a legitimate, evidenced-by-competitors v1.1+ feature if it turns out creators actually want it (e.g. "I only do ASMR in the evening, casual talk on weekends"). Do not build it now. Note this in the code as a comment so it isn't lost.

---

## 2. The weekly schedule UI

### Layout
A single Card containing 7 day rows (Sunday → Saturday, or start the week however the creator's locale prefers — default Sunday for v1, don't overthink this).

### Per-day row, exact structure
```
[Toggle: ON/OFF]  [Day name]                    [+ Add time block]  (only visible when day is ON)
                   09:00 AM – 05:00 PM  [×]      (only visible when day is ON, one row per block)
                   06:00 PM – 08:00 PM  [×]      (optional second block, same day)
```

- **Toggle** — reuse a switch/pill-style toggle component (build one if it doesn't exist yet, matching the design tokens — pill-shaped, `--accent` when on, `--bg-card-hover` when off). This is the single control that turns a day fully on/off, per Cal.com's confirmed pattern.
- When a day is toggled **on** for the first time, **prefill it with 9:00 AM – 5:00 PM** automatically — do not show an empty/blank state requiring the creator to manually enter numbers from scratch. This single default (taken directly from Calendly's and Cal.com's own default) removes the single biggest source of setup friction: a blank form with no starting point.
- **Time block row**: two time-picker Inputs (start, end) + a small `×` remove button. Use dropdown/select-style time pickers in 30-minute increments (matches the offering duration granularity already in the schema — 15/30/45/60), not free-text time entry, to avoid invalid input entirely.
- **"+ Add time block"** — lets a creator split a day (e.g. free 9am–12pm and again 6pm–9pm, skipping an afternoon). Optional, most creators will only ever use one block per day — don't make this prominent, small ghost-button link is enough.
- **Validation, inline, immediate**: end time must be after start time; a new block must not overlap an existing block on the same day. Show the error directly under the offending row, don't block the whole form.

### The single most important UX addition: "Copy to other days"
After a creator sets Monday's hours, show a small link/button next to that day: **"Copy to..."** → opens a tiny inline row of day checkboxes (Tue, Wed, Thu, Fri, Sat, Sun) → clicking applies Monday's exact block(s) to every checked day in one action. This is directly lifted from Cal.com's confirmed pattern and is the single highest-leverage feature for reducing setup time — most creators have the same hours Monday–Friday, and without this they're manually re-entering the same two time fields five times.

### Top-of-page quick-start (first-time setup only)
Before a creator has configured anything, show three one-click preset buttons above the day grid, each applying a common pattern in a single tap:
- **"Weekdays, 9–5"** → toggles Mon–Fri on with the 9am–5pm default, Sat/Sun off.
- **"Evenings, every day"** → all 7 days on, 6pm–10pm.
- **"Weekends only"** → Sat/Sun on (9am–5pm default), rest off.

These are just pre-filled versions of the same toggle+time UI already built — not a separate mechanism. Once any availability exists, hide these presets (they're onboarding scaffolding, not a persistent feature) and show the normal day grid.

### Timezone
Display the creator's timezone plainly at the top of the section: **"All times below are in [timezone], based on your account settings."** Pull from `users.timezone` (already captured at first login, per Step 2). Do not let the creator set a separate timezone here — one timezone per user, already established elsewhere in the build; keep it consistent, don't introduce a second source of truth.

---

## 3. Specific dates — the progressive-disclosure section

**Design principle applied here (and it should be read as the standard for this whole tab going forward): the page looks simple by default — a weekly grid and one small, clearly-labeled section below it. Power for edge cases lives one obvious click away, never visible until asked for.** This section replaces the earlier, too-narrow "Time off" design, which only supported *removing* availability. A creator must also be able to *add* a one-off window outside their recurring pattern — e.g. "I don't normally work Wednesdays, but open 9–10am this specific Wednesday" — without permanently changing their weekly schedule.

### Layout
A Card below the weekly grid, titled **"Specific dates"**, with one line of intro copy: *"Need to change just one day? Use this instead of your weekly schedule above."*

Two clearly labeled, side-by-side secondary buttons — not a submenu, not a dropdown. A creator scanning the page should be able to match their intent to a button instantly:

- **"+ Block a date"** — for removing availability on a date or range (vacation, a busy week).
- **"+ Open custom hours"** — for adding a one-off window on a specific date, overriding the recurring pattern just for that day.

This two-button layout is the actual answer to "well-named and easy to recognize" — a creator wanting the Wednesday-9-to-10 case reads "Open custom hours" and immediately knows that's the one, with zero ambiguity and zero extra sub-menu step.

### "+ Block a date" (unchanged from the original design)
Clicking it reveals an inline date-range picker: **"From [date] to [date]"** (a single day just sets the same start/end date), plus a Save/Cancel pair for that inline form. On save, writes to `availability_blocks` exactly as originally specified — no schema change for this branch.

### "+ Open custom hours" (new)
Clicking it reveals an inline form:
- A single-date picker (not a range — custom hours apply to one specific calendar date at a time; a creator wanting several unusual dates just repeats the action for each).
- The **exact same time-block editor UI already built for the weekly grid** — start/end time pickers in 30-minute increments, a small `× ` to remove a block, and a "+ Add another block" link for splitting the day. Reuse the component, don't rebuild it.
- Save/Cancel pair for the inline form.

On save, writes one or more rows to a **new table**, `availability_date_overrides`:
```
id             uuid PK
creator_id     uuid FK → creator_profiles.id, ON DELETE CASCADE
date           date NOT NULL              -- specific calendar date, creator-local
start_minute   int NOT NULL               -- same minute-from-midnight representation as availability_windows
end_minute     int NOT NULL
created_at     timestamptz DEFAULT now()
CHECK (start_minute < end_minute AND start_minute >= 0 AND end_minute <= 1440)
```
Multiple rows with the same `(creator_id, date)` represent multiple time blocks on that one overridden date, same pattern as `availability_windows` allowing multiple rows per `day_of_week`.

### Combined list, one list for both types
Below the two buttons, show every existing entry — both blocks and overrides — in one chronologically sorted list, each row tagged with a small Badge so the type is unambiguous at a glance:
- `"Aug 20 – Aug 25"` — Badge: **"Unavailable"** (muted gray)
- `"Wed, Aug 20 · 9:00 AM – 10:00 AM"` — Badge: **"Custom hours"** (`--accent`-outline)

Each row has a small `×` to remove it (deletes the block, or all override rows for that date).

### Slot-generation precedence (Step 5 algorithm — extend, don't replace)
When generating candidate slots for a given calendar date, check in this order and stop at the first match:
1. **Does the date fall within any `availability_blocks` range?** → zero slots for this date, full stop. (Block always wins — if a creator both opened custom hours and later blocked the same date, blocking takes priority. This is the sane default; don't let the two mechanisms fight silently.)
2. **Else, does the date have any `availability_date_overrides` rows?** → generate slots using *only* those rows as the day's windows, completely ignoring the recurring weekly pattern for this date.
3. **Else** → fall back to the existing recurring `availability_windows` matching this date's day-of-week, exactly as already built.

This is a genuine extension to the Step 5 function, not just a UI addition — flag it clearly as such when building.

---

## 4. Empty state (before any setup at all)

If a creator has zero `availability_windows`, the tab should not just show an empty grid — show the quick-start presets (Section 2) prominently above the (all-off) day grid, with a short line of copy: **"Set your weekly hours so fans know when to book you."** This directly addresses "configuring availability is fairly complex" — the empty state actively offers the easiest path (one-click preset) before asking the creator to configure anything manually.

---

## 5. Save behavior

Match the pattern already established and approved on the Profile tab: **staged, not immediate.** Toggling days, editing times, adding/removing blocks, and adding/removing specific-dates entries (both types) all update local component state only. A single **"Save availability"** button at the bottom of the tab commits everything in one action — replace the creator's `availability_windows`, `availability_blocks`, AND `availability_date_overrides` rows in one transaction (delete-and-reinsert is simplest and safe here since there's no history to preserve on any of these three tables, unlike offerings/bookings). Use the same "Saving... → Saved ✓ → Save availability" transient-button pattern already built for Profile.

**Important, and different from the Profile tab:** changing availability must **never** retroactively affect already-confirmed bookings. The Step 5 slot-generation algorithm only reads live windows/overrides to compute *future* candidate slots — it has no way to reach into or alter an existing `bookings` row, so this is naturally safe already. No special handling needed, just confirm this understanding holds before building: removing Tuesday from a schedule, or deleting a custom-hours override, does not cancel a booking that was already confirmed before the change.

---

## 6. What's explicitly NOT in v1

Per-offering distinct schedules (Section 1); calendar sync (Google/Outlook) — real competitors all offer this, but it's a substantial integration on its own and out of scope for launch; minimum-notice/buffer-time customization beyond the existing fixed 60-minute lead time from the build spec; multiple named schedules (e.g. "summer hours" vs "winter hours") — one live schedule per creator only; recurring custom-hours patterns (e.g. "every third Wednesday") — Section 3's custom hours apply to single, individually-picked dates only.

---

## 7. Files/components involved

- New: a `Switch`/`Toggle` component (design-token-consistent) if one doesn't already exist in the component library — used for day on/off.
- New: migration adding the `availability_date_overrides` table (Section 3) — show before running, same discipline as every prior schema change.
- Rebuild `AvailabilityManager.tsx` per Sections 2–5, including the new two-button "Specific dates" section.
- Server action(s): the combined `saveAvailability` action (Section 5) now also handles `availability_date_overrides` the same delete-and-reinsert way as windows/blocks — same safety reasoning applies (pure configuration, no dependents, no history to preserve).
- Extend the Step 5 slot-generation function per Section 3's precedence rule (block > override > recurring) — this is a real logic change to existing, previously-tested code, not just new UI. Re-run Step 5's original test cases plus new ones covering the override precedence.
- Reuse existing Input (time pickers, date pickers), Button, Card components, and the same time-block-editor sub-component from the weekly grid for the "Open custom hours" form — don't rebuild it.
