# Haibu — Button System

> Authoritative reference for every button decision in the codebase. Any agent, developer, or designer should be able to answer "which button do I use here?" from this document alone, without asking anyone. Research-grounded, Haibu-specific, locked.

---

## 1. The fundamental rule

**Every button on every screen answers one question: "what is the most important thing a user can do right now?"**

Primary buttons answer that question visually — they draw the eye first. Everything else (secondary, ghost, destructive) tells the user "this is also available, but less urgent." If you can't identify which action is most important on a screen, you have a product design problem, not a button problem.

**One primary button per decision point. Never two.**

Two equally-weighted primary buttons force the user to decide which one the interface should have already prioritized. If you find yourself wanting two primary buttons, one of them is secondary.

---

## 2. The five variants — what they are and when to use each

### 2.1 Primary

**What it looks like:** White fill, dark text (`--color-on-primary`), pill radius (`--radius-pill`), full opacity.

**What it means:** "This is the single most important action on this screen or in this context."

**Use when:**
- Moving a user forward through a positive flow (booking, signing up, publishing, submitting)
- There is one clear action that matters more than any other on this screen
- The action is constructive — it creates, confirms, or completes something

**Haibu-specific examples:**
- "Book session" (booking flow confirmation)
- "Create account" / "Log in" (auth screens)
- "Publish profile" (creator going live)
- "Submit review" (review form)
- "Confirm payment" (payment step)
- "Save availability" (creator studio)
- "Save changes" (profile tab)

**Hard rules:**
- Maximum one per screen section or modal
- Never use for navigation — use a link instead
- Never use for destructive actions — use Destructive
- Never use for low-importance supporting actions — use Ghost

---

### 2.2 Secondary

**What it looks like:** Neutral gray fill (`--color-neutral-default`), white text, pill radius. Visually quieter than Primary but still clearly a button.

**What it means:** "This action is available and real, but it's not the main thing you should do right now."

**Use when:**
- The action is valid but subordinate to the primary action
- Multiple actions exist and need hierarchy
- The action is reversible and low-consequence

**Haibu-specific examples:**
- "Edit" (on offering cards alongside a more important CTA)
- "Change" (swap offering in booking flow — present but not the main CTA)
- "Deactivate" (toggle an offering off — valid but not the primary goal)
- "Cancel" inside a modal when paired with a Primary confirm button
- "Add time block" (availability tab — adding to an existing setup)

**Hard rules:**
- Can appear multiple times on a screen (unlike Primary)
- Should always feel visually subordinate next to a Primary button
- In a button group: Secondary goes to the left of Primary (left-to-right reading order = less important first)

---

### 2.3 Ghost

**What it looks like:** Transparent fill, muted text (`--color-text-secondary`), no visible border at rest. Lowest visual weight.

**What it means:** "This is available, but you should feel no pressure to use it right now."

**Use when:**
- The action is low-frequency or optional
- You need a button-like affordance without pulling visual weight
- Paired with a Primary or Secondary to offer an escape hatch

**Haibu-specific examples:**
- "Show inactive offerings (2)" (low-priority toggle)
- "See all →" (browse more link on homepage shelves)
- "Back to dashboard" (navigation escape)
- "Use a different email" (in the OTP verification screen — present but shouldn't tempt)
- "Skip for now" (if any optional onboarding steps exist)
- "Copy to..." (availability tab — useful but not the main action)

**Hard rules:**
- Never use as the only action on a screen — something must be more prominent
- Fine to use for navigation-like actions where a plain link would feel too invisible
- Do NOT use for destructive actions — Ghost makes destructive actions look safe

---

### 2.4 Destructive

**What it looks like:** Error red fill (`--color-error: #EF4444`), white text, pill radius. Visually alarming on purpose.

**What it means:** "This action is permanent, irreversible, or deletes real data. Proceed carefully."

**Use when:**
- The action cannot be undone
- Real data (bookings, offerings, accounts) is permanently removed
- Money is affected negatively (refund-triggering cancellation)

**Haibu-specific examples:**
- "Delete offering" (zero-booking case — actual hard delete)
- "Confirm cancellation" in the cancel-booking modal (triggers a refund, ends the booking permanently)
- Any future "Delete account" flow

**Hard rules:**
- Always requires a confirmation step (modal) before executing — NEVER a single-click destructive action
- The button in the confirmation modal is Destructive; the button that *opens* the confirmation modal can be Secondary or Ghost
- Separate destructive buttons from constructive ones with whitespace or a divider — never place "Delete" next to "Save"
- Label must clearly state the consequence: "Delete offering" not "Delete"; "Cancel session" not "Cancel"
- NEVER use `--color-brand` (the brand red) for destructive actions — brand red and error red must feel different

---

### 2.5 Leave call (special case, call screen only)

**What it looks like:** White fill (same as Primary), dark text, pill radius.

**What it means:** "End this paid session." Consequential but not dangerous — ending a call loses nothing permanently, but it is the end of a paid experience.

**Use when:** Only on the video call screen tray, as the Leave button.

**Why not Destructive:** Destructive signals irreversible data loss. Leaving a call doesn't delete anything — it ends an experience. The white primary treatment makes it visually distinct from the neutral gray tray buttons without implying danger.

**Why not just neutral gray:** This is a paid session. The Leave button must stand out so it's never accidentally hit, but also clearly findable when someone genuinely wants to leave.

---

## 3. States — every button must implement all six

Hierarchy and variants define *what* a button is. States define *what's happening right now*. Don't conflate them.

### 3.1 Default (enabled)
The resting state. The button is ready to be clicked. This is the variant styles defined above.

### 3.2 Hover
Triggered when a cursor moves over the button. Must be visually distinct from default — not subtle enough to miss.
- Primary: `--color-primary-hover` (#E8E8E8 in dark mode)
- Secondary/Ghost: `--color-neutral-hover`
- Destructive: slightly darker error red
- **Mobile note:** touch devices have no hover state. Never rely on hover to communicate critical information.

### 3.3 Focus
Triggered by keyboard navigation (Tab key) or assistive technology. **This is the most commonly skipped state and the most important for accessibility.**
- Must show a visible, high-contrast outline ring (2px minimum, `--color-primary` or `--color-brand` as appropriate)
- WCAG 2.2 requires focus indicators to have at least 3:1 contrast against adjacent colors
- Never remove focus styling with `outline: none` without replacing it

### 3.4 Active / Pressed
Triggered the moment a button is clicked, before the action resolves. Provides immediate tactile feedback.
- Slight darkening or subtle scale-down (e.g. `scale(0.98)`)
- Duration: ~100ms — fast enough to feel instant

### 3.5 Disabled
The action is not currently available. Must communicate *why* if possible.
- Visual: 40% opacity, `cursor: not-allowed`
- `aria-disabled="true"` on the element (not `disabled` alone — `disabled` removes the element from tab order, making it invisible to keyboard users)
- Wherever possible, explain WHY it's disabled (e.g. "Complete your profile to publish") — a disabled button with no explanation is one of the most frustrating UX patterns in existence
- **When to use:** form not yet complete (Join button before the join window opens), required fields empty, action unavailable in this state

### 3.6 Loading
Triggered immediately after click, while the action is processing (API call, form submission).
- Disable the button immediately on click to prevent double-submission
- Show a spinner or "Saving..." label inside the button, same size as the original label
- Do NOT show a separate loading overlay unless the whole page is blocked
- Haibu's established pattern (already built): "Saving... → Saved ✓ → Save availability" transient state — use this pattern consistently

---

## 4. Placement rules

### In a form or modal
- Primary action: **right side** (or bottom of a stacked layout)
- Secondary/Cancel: **left of primary** (or above in stacked layout)
- Destructive: **separated by whitespace**, never adjacent to constructive actions
- Mobile: stack vertically, primary on top

### On a page (standalone CTA)
- One primary, centered or right-aligned depending on the layout
- Supporting actions below or beside, visually subordinate

### In a card (e.g. creator card, offering card)
- The card itself should be the primary clickable target (the whole card navigates)
- Inline buttons inside cards should be Secondary or Ghost — never Primary competing with the card's own affordance

### In a data table or list (e.g. offerings list, admin panel)
- Row-level actions are Secondary or Ghost — never Primary
- Maximum 3 visible actions per row; use a "..." overflow menu beyond that
- Primary action, if any, belongs above the table, not inside rows

---

## 5. Labeling rules (from research: this is where most button UX fails)

### Do
- **Verb + object:** "Book session," "Delete offering," "Save changes," "Publish profile"
- Describe the outcome, not the interaction: "Send code" not "Submit"
- Be specific: "Cancel session" not "Cancel"

### Never
- Generic labels: "Submit," "OK," "Yes," "Confirm," "Click here"
- One-word-only labels when context is ambiguous: "Delete" (delete what?)
- Vague labels that don't survive out of context: a screen reader user tabbing through buttons should understand each one without reading the surrounding text

### For destructive confirmation modals specifically
The confirmation button must restate the destructive action: "Delete offering" (not "Confirm"), "Cancel session" (not "Yes"). This is both a UX best practice and a legal/trust consideration — users should never feel tricked into a destructive action.

---

## 6. Haibu-specific decision table

Use this table when you're unsure which variant to use. If a use case isn't listed, apply the principles from Sections 2-4 and add it here.

| Location | Button | Variant | Reason |
|---|---|---|---|
| Booking flow — payment confirmation | "Book session" | Primary | Single most important action in the flow |
| Booking flow — change offering | "Change" | Secondary | Present but subordinate to Book |
| Booking detail — join call | "Join" | Primary | The one action that matters on this page |
| Booking detail — cancel booking | "Cancel session" | Secondary (opens modal) | Opens confirmation, not the destructive action itself |
| Cancel confirmation modal | "Cancel session" | Destructive | Irreversible, money-affecting |
| Cancel confirmation modal | "Keep session" | Ghost | Escape hatch, no pressure |
| Creator Studio — save profile | "Save changes" | Primary | The goal of being on this tab |
| Creator Studio — deactivate offering | "Deactivate" | Secondary | Valid but not the primary goal |
| Creator Studio — delete offering | "Delete" | Secondary (opens modal) | Opens confirmation |
| Delete confirmation modal | "Delete offering" | Destructive | Permanent data loss |
| Delete confirmation modal | "Keep offering" | Ghost | Escape hatch |
| Auth — log in / create account | "Log in" / "Create account" | Primary | The goal of the page |
| Auth — forgot password link | "Forgot password?" | Ghost | Low-emphasis, optional |
| Video call tray — mute, camera, etc. | Icon-only buttons | Neutral (no variant, just icon) | Utility controls, no hierarchy needed |
| Video call tray — leave | "Leave" | Leave call (white) | Distinct from tray icons, consequential but not dangerous |
| Admin panel — force cancel | "Force cancel" | Secondary (opens modal) | Opens confirmation |
| Admin panel — confirm force cancel | "Confirm cancellation" | Destructive | Irreversible |
| Admin panel — suspend user | "Suspend" | Secondary (opens modal) | Opens confirmation |
| Homepage — "Become a Creator" | "Become a Creator" | Primary | The main CTA in the NavBar |
| Creator profile — "Book a session" | "Book a session" | Primary | The entire purpose of the page |
| Review form — submit | "Submit review" | Primary | The goal of the form |
| Review form — skip / close | "Maybe later" | Ghost | No pressure |
| Availability — save | "Save availability" | Primary | Goal of being on the tab |
| Availability — add time block | "+ Add time block" | Ghost | Low-emphasis addition |
| Availability — mark unavailable | "Mark unavailable" | Secondary | Supporting action |
| Search — search icon/button | Search icon | Ghost | Utility, not a CTA |

---

## 7. What this does NOT cover

- **Link vs. button:** If it navigates to a new page/route, it's a `<a>` tag, not a `<button>`. Buttons do things; links go places. This distinction matters for accessibility and browser behavior.
- **Icon-only buttons:** Call screen tray controls are icon-only. These aren't covered by the Primary/Secondary/Ghost/Destructive framework — they're utility controls with their own neutral styling defined in the design token doc.
- **Toggle/switch:** On/off states for availability days, notification preferences — these are switches, not buttons. Covered separately in the component library.
- **Pills as buttons:** Category filter pills and tag badges are interactive but styled as pills, not buttons. Their active/inactive states are defined in the design token doc (white = active, neutral gray = inactive).
