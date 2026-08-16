# Haibu — Design Token System

> Authoritative spec for the token architecture, button patterns, and color discipline. The goal: change the brand color from red to blue in one line. Add light mode in one file. Never hunt for a hex value again.

---

## 1. The problem with the current system

Right now `globals.css` defines flat tokens like `--color-accent: #A81120`. Every component references this directly. This works, but it has two real problems:

1. **No semantic meaning** — `--color-accent` doesn't say *what* it's for. Is it for buttons? For danger states? For hover states? For links? Different developers (or the same developer a month later) guess differently, producing inconsistent usage.
2. **Not theme-swappable** — to change the brand color from red to blue, you'd have to hunt through every component and change every place that uses `--color-accent` for brand purposes vs. every place that uses it for danger/error purposes (which happen to be the same color today but shouldn't be).

The fix is a **three-tier token architecture**, confirmed as industry standard by Google Material Design 3, Salesforce Lightning, and Adobe Spectrum.

---

## 2. Three-tier token architecture

### Tier 1 — Primitive tokens (raw values, never used directly in components)
These are the actual hex values. They don't change between themes.

```css
/* Brand palette */
--primitive-red-900: #5C0A0F;
--primitive-red-700: #A81120;   /* current brand accent */
--primitive-red-500: #C21329;   /* hover */
--primitive-red-300: #8A0E1A;   /* pressed */

/* Neutrals */
--primitive-black: #000000;
--primitive-gray-950: #121212;  /* current bg-base */
--primitive-gray-900: #1A1A1A;  /* current bg-surface */
--primitive-gray-850: #1E1E1E;  /* current bg-card */
--primitive-gray-800: #232323;  /* current bg-card-hover */
--primitive-gray-700: #2A2A2A;  /* current border-subtle */
--primitive-gray-400: #5A5A5A;  /* current text-tertiary */
--primitive-gray-300: #8A8A8A;  /* current text-secondary */
--primitive-white: #FFFFFF;

/* Functional */
--primitive-green-400: #3BD671; /* live/available only */
--primitive-red-error: #EF4444; /* error states — deliberately NOT brand red */
```

**To swap brand from red to blue tomorrow:** add `--primitive-blue-700: #1D4ED8` etc. and remap Tier 2. Zero component changes.

---

### Tier 2 — Semantic tokens (meaning, used by components)
These are the tokens components actually reference. They point to primitives. This is where theme switching happens.

```css
/* === DARK MODE (default) === */
:root {
  /* Backgrounds */
  --color-bg-base: var(--primitive-gray-950);
  --color-bg-surface: var(--primitive-gray-900);
  --color-bg-card: var(--primitive-gray-850);
  --color-bg-card-hover: var(--primitive-gray-800);

  /* Borders */
  --color-border-subtle: var(--primitive-gray-700);

  /* Text */
  --color-text-primary: var(--primitive-white);
  --color-text-secondary: var(--primitive-gray-300);
  --color-text-tertiary: var(--primitive-gray-400);
  --color-text-inverse: var(--primitive-gray-950); /* text on light bg */

  /* Brand — interactive */
  --color-brand-default: var(--primitive-red-700);
  --color-brand-hover: var(--primitive-red-500);
  --color-brand-pressed: var(--primitive-red-300);
  --color-brand-subtle: rgba(168, 17, 32, 0.12); /* brand tint bg */

  /* Functional */
  --color-live: var(--primitive-green-400);    /* available/live ONLY */
  --color-error: var(--primitive-red-error);   /* form errors, destructive */
  --color-error-subtle: rgba(239, 68, 68, 0.12);

  /* Neutral interactive */
  --color-neutral-default: var(--primitive-gray-800);
  --color-neutral-hover: var(--primitive-gray-700);
}

/* === LIGHT MODE (future — add when ready) === */
[data-theme="light"] {
  --color-bg-base: var(--primitive-white);
  --color-bg-surface: #F8F8F8;
  --color-bg-card: #F0F0F0;
  --color-bg-card-hover: #E8E8E8;
  --color-border-subtle: #D4D4D4;
  --color-text-primary: var(--primitive-gray-950);
  --color-text-secondary: #525252;
  --color-text-tertiary: #737373;
  --color-text-inverse: var(--primitive-white);
  /* Brand stays the same in light mode */
  --color-brand-default: var(--primitive-red-700);
  --color-brand-hover: var(--primitive-red-500);
  --color-brand-pressed: var(--primitive-red-300);
  /* etc — complete this block when light mode is actually built */
}
```

**To add light mode:** flip `data-theme="light"` on `<html>` — every component updates automatically. No touching individual components.

---

### Tier 3 — Component tokens (scoped overrides, only when needed)
Only used when a component has a specific variant that doesn't map cleanly to a semantic token. Keep these rare.

```css
/* Example — only if a specific component needs it */
--button-primary-bg: var(--color-brand-default);
--button-primary-bg-hover: var(--color-brand-hover);
--button-primary-text: var(--color-text-primary);
```

---

## 3. Button pattern — the definitive guide

This is the most inconsistent part of the current codebase. Clear rules, no ambiguity.

### Primary button
**Use for:** the single most important action on a page or modal. One per screen/section maximum.
**Visual:** `--color-brand-default` fill, white text, `--radius-pill`.
**When to use `--color-brand-default` (red):**
- "Book session" (booking flow's CTA)
- "Leave" (call screen — the one button that should be visually distinct)
- "Publish profile" (the creator's go-live moment)
- "Submit review"
- "Confirm cancellation" (in the modal — this IS destructive, red is appropriate)

### Secondary button
**Use for:** secondary actions that matter but aren't the primary CTA.
**Visual:** `--color-neutral-default` fill, white text, `--radius-pill`.
**Examples:** "Change" (swap offering in booking flow), "Edit" (offerings), "Cancel" (dismiss a modal without action).

### Ghost button
**Use for:** low-emphasis actions, navigation links styled as buttons.
**Visual:** transparent fill, `--color-text-secondary` text, no border. Underline on hover optional.
**Examples:** "See all →", "Show inactive", "Back to dashboard".

### Destructive button
**Use for:** permanent, irreversible actions that lose data.
**Visual:** `--color-error` fill (NOT `--color-brand-default`), white text, `--radius-pill`.
**Why separate from primary:** "Delete offering" and "Book session" should never look the same. Red for both conflates "exciting action" with "dangerous action."
**Examples:** "Delete offering" (zero-booking case — this is a real hard delete).

### Icon-only button (call screen tray)
**Use for:** the video call control bar exclusively.
**Visual:** `--color-neutral-default` fill, white icon, circular or pill shape.
**Exception:** "Leave call" uses `--color-brand-default` fill — it's the one button that should stand out in that context, and it's already been verified as correct through the call screen work.

---

## 4. Where red (brand color) is allowed — exhaustive list

The discipline that's been consistently hard to maintain. This is now the definitive, locked list. If something isn't on this list, it should not be red.

**Always red (`--color-brand-default`):**
- The haibu logo dot
- Primary CTA buttons (Section 3 above)
- Active/selected pill states (category filters, tab active state)
- "Leave call" button specifically
- The NavBar "Become a Creator" / "Creator Studio" buttons (primary CTAs in the nav)
- The "Log in" / "Create account" submit button

**Never red — use `--color-error` instead:**
- Form validation errors
- Error states / toast error messages
- Destructive action buttons (delete, permanent remove)

**Never red — use `--color-live` instead:**
- "Available today" indicator dot
- Any "live" / "online" status badge

**Never red — use neutral styling:**
- Hover states on non-CTA elements
- Active speaker ring on call screen (removed — confirmed correct decision)
- Borders, dividers, separators
- Icon buttons in the call tray (except Leave)

---

## 5. Tailwind v4 mapping

Since the app uses Tailwind v4 with the `@theme` directive, the semantic tokens map directly to utility classes:

```css
@theme {
  /* Semantic tokens become Tailwind utilities */
  --color-bg-base: ...;         → bg-bg-base
  --color-bg-surface: ...;      → bg-bg-surface
  --color-bg-card: ...;         → bg-bg-card
  --color-brand-default: ...;   → bg-brand-default, border-brand-default, text-brand-default
  --color-text-primary: ...;    → text-text-primary
  --color-error: ...;           → bg-error, text-error, border-error
  --color-live: ...;            → text-live, bg-live
}
```

No more `bg-[#A81120]` anywhere. Every color reference goes through a named token.

---

## 6. What needs to change in the codebase

### globals.css
Replace the current flat token list with the three-tier structure above. The primitive tokens are new; the semantic tokens are renames/restructures of what already exists. Net result: same visual output, but now theme-swappable.

### Every component
Replace direct hex values (`#A81120`, `#1E1E1E`, etc.) with semantic token utilities (`bg-brand-default`, `bg-bg-card`). This is the largest part of the work — a systematic find-and-replace, not creative work.

### Button component
Update the Button component to enforce the four variants (primary, secondary, ghost, destructive) with the correct semantic tokens per Section 3. Remove any ad-hoc color overrides on specific button instances.

---

## 7. What this enables

- **Brand color change:** edit one primitive token (`--primitive-red-700: #1D4ED8`), remap semantic tokens. Done.
- **Light mode:** add `[data-theme="light"]` block to globals.css, wire a toggle. No component changes.
- **Consistent red discipline:** every place that *should* be red references `--color-brand-default`. Every place that *shouldn't* references `--color-error` or `--color-neutral-default`. Never ambiguous again.
- **Future design system audit:** any component using a raw hex value is a bug. Easy to grep for and fix.
