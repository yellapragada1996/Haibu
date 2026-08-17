# Haibu — Design Language (Color & Component Tokens)

> **Authoritative.** Full replacement for the prior `haibu-design-token-system.md`.
> The prior doc's "red as brand fill" assumption is **superseded**: brand red is now reserved for **identity only** (logo dot + card category badges), and the interface is **monochrome-first**. Light mode is designed in from day one via a complete `[data-theme="light"]` block.

---

## 1. Philosophy — monochrome-first, color = meaning

1. **White, black, and gray do all structural work** — backgrounds, cards, borders, text, and buttons.
2. **Color is reserved exclusively for meaning**, never for decoration.
3. **Importance is communicated by lightness, not hue** — white = primary, gray = secondary, transparent = ghost.
4. **Red is the loudest signal in UI.** It is restricted to the narrowest possible set of meanings: the **brand mark** (identity) and **errors/destruction** (danger). Nothing else is red.

This is the discipline that removes the "looks like a danger app" problem: a user never has to ask "is this red thing a button or a warning?" — red is *never* a positive-flow button.

---

## 2. Three-tier token architecture

Primitive → Semantic → Component. (Industry standard: Material 3, Adobe Spectrum, Salesforce Lightning.)

### Tier 1 — Foundation tokens (raw values; never referenced by components)

#### Color primitives

```css
/* Neutrals */
--primitive-black: #000000;
--primitive-gray-950: #121212;   /* bg-base */
--primitive-gray-900: #1A1A1A;   /* bg-surface */
--primitive-gray-850: #1E1E1E;   /* bg-card */
--primitive-gray-800: #232323;   /* bg-card-hover / neutral default */
--primitive-gray-700: #2A2A2A;   /* border-subtle / neutral hover */
--primitive-gray-400: #5A5A5A;   /* text-tertiary */
--primitive-gray-300: #8A8A8A;   /* text-secondary */
--primitive-gray-100: #E8E8E8;   /* primary hover */
--primitive-white: #FFFFFF;

/* Brand — identity only, static (no hover/pressed shades needed) */
--primitive-red-700: #A81120;

/* Semantic hues */
--primitive-green-400: #3BD671;   /* live / available */
--primitive-yellow-400: #FFC53D;  /* stars */
--primitive-red-error: #EF4444;   /* error / destructive */
```

> The previous doc's red *scale* (`red-300/500/900`) is removed: brand red is now static, so no interactive brand shades exist. (It also contained a labeling error — the "pressed" value `#8A0E1A` was darker than the base but labeled `red-300`; that scale is gone entirely.)

#### Radius primitives

```css
--radius-card: 14px;
--radius-input: 12px;
--radius-pill: 999px;
--radius-modal: 20px;
```

#### Typography primitives

```css
--font-family-sans: "Inter", system-ui, sans-serif;
--font-size-h1: 32px;
--font-size-h2: 24px;
--font-size-h3: 18px;
--font-size-body: 15px;
--font-size-small: 13px;
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

#### Spacing primitives (4px base grid)

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
--space-16: 64px;
```

### Tier 2 — Semantic tokens (meaning; referenced by components; theme-swappable)

#### Dark mode (default)

```css
:root {
  /* Backgrounds */
  --color-bg-base: var(--primitive-gray-950);
  --color-bg-surface: var(--primitive-gray-900);
  --color-bg-card: var(--primitive-gray-850);
  --color-bg-card-hover: var(--primitive-gray-800);
  --color-border-subtle: var(--primitive-gray-700);

  /* Text */
  --color-text-primary: var(--primitive-white);
  --color-text-secondary: var(--primitive-gray-300);
  --color-text-tertiary: var(--primitive-gray-400);

  /* Primary action — elevated WHITE (the brightest thing on screen) */
  --color-primary: var(--primitive-white);
  --color-primary-hover: var(--primitive-gray-100);
  --color-on-primary: var(--primitive-gray-950);

  /* Neutral interactive */
  --color-neutral-default: var(--primitive-gray-800);
  --color-neutral-hover: var(--primitive-gray-700);

  /* Brand — identity ONLY (logo dot + card category badges) */
  --color-brand: var(--primitive-red-700);

  /* Semantic */
  --color-live: var(--primitive-green-400);     /* available / live / confirmed */
  --color-rating: var(--primitive-yellow-400);  /* stars only */
  --color-error: var(--primitive-red-error);    /* errors + destructive */
}
```

#### Light mode (complete — add later by flipping one attribute)

```css
[data-theme="light"] {
  --color-bg-base: #FFFFFF;
  --color-bg-surface: #F8F8F8;
  --color-bg-card: #F0F0F0;
  --color-bg-card-hover: #E8E8E8;
  --color-border-subtle: #D4D4D4;

  --color-text-primary: #121212;
  --color-text-secondary: #525252;
  --color-text-tertiary: #737373;

  /* Primary inverts to dark in light mode (darkest thing on a light screen) */
  --color-primary: #121212;
  --color-primary-hover: #232323;
  --color-on-primary: #FFFFFF;

  --color-neutral-default: #E8E8E8;
  --color-neutral-hover: #D4D4D4;

  --color-brand: #A81120;   /* brand stays red in both themes */
  --color-live: #3BD671;
  --color-rating: #FFC53D;
  --color-error: #EF4444;
}
```

> **To add light mode later:** set `data-theme="light"` on `<html>` (plus a persisted toggle). Every component updates automatically. No per-component changes.

### Tier 3 — Component tokens (rare; only when a variant doesn't map cleanly)

```css
--button-primary-bg: var(--color-primary);
--button-primary-text: var(--color-on-primary);
--button-destructive-bg: var(--color-error);
--button-destructive-text: var(--primitive-white);
--badge-category-bg: var(--color-brand);
```

---

## 3. Button patterns — the definitive guide

### Primary (positive flow)
- **Visual:** white fill (`--color-primary`), dark text (`--color-on-primary`), pill radius.
- **Use:** Book session · Become a Creator · Publish profile · Submit review · Log in / Create account · Confirm payment.
- One primary per screen/section, maximum.

### Secondary
- **Visual:** neutral gray fill (`--color-neutral-default`), white text, pill.
- **Use:** Edit · Change · Cancel (dismiss a modal without consequence).

### Ghost
- **Visual:** transparent, `--color-text-secondary` text, no border.
- **Use:** "See all →" · "Back to dashboard" · "Show inactive".

### Destructive
- **Visual:** red fill (`--color-error`), white text, pill.
- **Use:** Delete offering · cancel-with-refund confirmation. Irreversible data loss only.

### Leave call (special case)
- **Visual:** **white fill** (same as primary), dark text, pill.
- **Rationale:** ending a paid session early is consequential — it must stand out from the neutral tray — but red would misread as "danger/error." White makes it distinct and important without implying danger.

> "Confirm cancellation" (refund flow) is **Destructive** — it lives only in that list, never Primary.

---

## 4. Where each color is allowed — locked, exhaustive

If something is not on this list, it is not that color.

| Color | Allowed in | Never in |
|---|---|---|
| **White** (`--color-primary`) | primary CTAs, active pill/tab state, **Leave call** | — |
| **Gray** (`--color-neutral-*`) | secondary/ghost buttons, icon-only tray buttons (except Leave), inactive filter pills, hover states | — |
| **Red — brand** (`--color-brand`) | **logo dot**, **category tag badges on creator cards** | every other UI element |
| **Red — error** (`--color-error`) | form validation errors, destructive buttons, error toasts | CTAs, pills, tabs, Leave call |
| **Green** (`--color-live`) | "Available today" / "Live" / "Confirmed" indicators | decorative use |
| **Yellow** (`--color-rating`) | star ratings | decorative use |

### The two brand-red exceptions (identity, not function)
1. **Logo dot** — the brand mark, always red.
2. **Category tag badges on creator cards** (ASMR / Music / Casual Talk) — the one place brand color makes a Haibu card recognizably Haibu.

Every *other* pill — filter pills, tab states, status chips — is **neutral gray** (or white when active).

---

## 5. Contrast & accessibility

- Body text: **≥ 4.5:1** contrast against its background (WCAG AA).
- Large text (≥18px, or ≥14px bold) and UI component fills: **≥ 3:1**.
- Known-safe pairs:
  - White primary + `#121212` text ≈ **19:1**.
  - Brand red `#A81120` + white ≈ **7.6:1** (fine for badges).
  - Error red `#EF4444` + white ≈ **3.8:1** (fine for large/bold button labels and UI fills; use a darker error shade or dark text for body-size copy).
  - `#3BD671` (live) and `#FFC53D` (stars) are **indicator colors** — when used as text, always pair with dark text.
- **Any future brand-color remap must re-verify these ratios before shipping.**

---

## 6. Tailwind v4 mapping

```css
@theme {
  --color-bg-base: ...;          → bg-bg-base
  --color-primary: ...;          → bg-primary, text-primary, border-primary
  --color-on-primary: ...;       → text-on-primary
  --color-neutral-default: ...;  → bg-neutral-default
  --color-brand: ...;            → bg-brand, text-brand
  --color-live: ...;             → text-live, bg-live
  --color-rating: ...;           → text-rating, bg-rating
  --color-error: ...;            → bg-error, text-error, border-error
  --radius-card: ...;            → rounded-card
  --radius-pill: ...;            → rounded-pill
}
```

No raw hex (`bg-[#A81120]`) anywhere in components.

---

## 7. Migration plan (after approval — do not start before)

1. **`globals.css`** — replace with the three-tier structure above (colors + radius + font + spacing). Neutrals keep the same visual output; brand/primary/accent are remapped.
2. **`Button` component** — enforce primary / secondary / ghost / destructive, plus the Leave-call white variant.
3. **`CreatorCard`** — category badges → `--color-brand` (keep red); nothing else changes on the card.
4. **Filter pills / tabs** — active → white; inactive → neutral gray.
5. **Call tray** — icon buttons neutral; **Leave → white**.
6. **Stars → `--color-rating`; live indicators → `--color-live`.**
7. **`DAILY_CSS` (call screen)** — documented exception: it is injected into Daily's cross-origin iframe and **cannot** reference `@theme` variables; its hex values are kept in sync manually.

### Verification gate (run after migration, and in CI)

```bash
grep -rn "#[0-9A-Fa-f]\{3,8\}" src --include="*.tsx" --include="*.ts" --include="*.css" \
  | grep -v "globals.css" \
  | grep -v "DAILY_CSS"
```

Must return **zero matches**. The only permitted raw hex are the primitive definitions in `globals.css` and the injected `DAILY_CSS` string in the call page.

---

## 8. What this enables

- **Brand identity stays red** (logo + card badges) and recognizably Haibu.
- **The interface stops reading as danger** — red appears only on the logo, card badges, and genuine errors/destructive actions.
- **Lightness conveys hierarchy; color conveys meaning.** No ambiguity.
- **Light mode is one attribute away** — flip `data-theme="light"` and everything updates.
- **Future-proofing:** a brand-color change is a one-line primitive edit; any raw hex in a component is a grep-able bug.
