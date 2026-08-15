# Haibu — Call Screen Redesign Spec

> Authoritative for the video call screen overhaul. Read fully before touching code. This replaces the "basic theming only" constraint from the original Step 11 spec (Section 5.5) — that constraint was based on incomplete information about what Daily actually exposes. It exposes much more.

---

## 1. Diagnosis — why it feels like Zoom, precisely

The current implementation only used Daily Prebuilt's `theme.colors` object — a small, fixed set of ~10 color-swap keys (`mainAreaBg`, `mainAreaBgAccent`, etc.). That surface can only recolor Daily's existing shapes; it cannot change the shapes themselves. Zoom/Google Meet/Daily's default look is defined by more than color — **sharp-cornered rectangular video tiles arranged in a rigid grid, a flat gray control bar, and no personality in empty/loading states.** Recoloring that skeleton dark still leaves the skeleton.

**The fix is not a new integration — it's using a capability that was already available and never used.** Daily Prebuilt supports real CSS injection at frame creation:
```js
Daily.createFrame({
  cssFile: 'https://.../daily-overrides.css', // or:
  cssText: `.daily-video-tile { border-radius: 20px; } ...`,
  bodyClass: 'haibu-call-theme',
})
```
This targets Daily's actual internal DOM elements — video tiles, the control bar, participant name tags, the chat panel — directly with real CSS, not just swapping predefined color variables. This is the single highest-leverage fix available and should be the primary lever used before considering anything more drastic.

---

## 2. Tier 1 (build this now) — Prebuilt + real CSS injection reskin

Stay on Daily Prebuilt (`createFrame()`) — do not migrate to custom callObject mode yet (see Section 4 for why that's deferred, not ruled out). Apply a real CSS override file/text at frame creation targeting:

### Video tiles
- **Full `--radius-card` (14px) rounding** on every video tile — this single change does more to kill the "Zoom" feeling than anything else, since rectangular sharp tiles are the most recognizable visual signature of corporate video software.
- Tile background (before video loads / when camera's off): `--bg-card` (#1E1E1E), not Daily's default gray.
- **Active-speaker indicator**: replace Daily's default (usually a plain border color change) with a `--accent` (#A81120) glowing ring/border around whoever is currently speaking — this is a small, satisfying, lively touch that a static gray call never has.
- Participant name tag: reposition as a small rounded pill (matches the Badge/Pill component's shape) at the bottom-left of the tile, dark semi-transparent background, white text — not Daily's default plain label strip.

### Control bar (mute, camera, leave, etc.)
- Restyle each button to match the app's actual `Button` component shape: circular or fully rounded, dark `--bg-card-hover` fill for neutral actions, `--accent` fill specifically for the "Leave" button (it's the one destructive/final action, should stand out the way it does everywhere else in the app).
- Remove Daily's default flat gray bar background entirely; make the bar float — a `--bg-surface` rounded pill-shaped container with padding, sitting a comfortable margin above the bottom edge, not a full-width flat strip glued to the screen edge (a flat edge-to-edge bar is itself part of the "conferencing software" visual signature — a floating rounded control cluster reads as considered, not default).

### Loading / waiting states
- Replace any default "Connecting..." Daily text with our own copy and the `--accent` color, matching the app's established playful tone (recall the Visualizer's loading-message guidance elsewhere in this build — short, a little personality, not clinical).

### Chat — turn it on, then restyle it
Daily Prebuilt includes a built-in chat panel as a real, available feature — it was simply never enabled in what was built. Before building anything:
1. **Have DeepSeek confirm the exact current config property name for enabling Prebuilt's chat panel** directly from Daily's live docs at build time (`docs.daily.co`) — don't guess or hardcode a flag name from an old blog post, since Daily's Prebuilt API surface has changed versions before (as seen in the property-name mismatches already hit twice tonight with `mainAreaBgAccent`). Confirm the real, current key before writing code.
2. Once enabled, restyle the chat panel via the same CSS injection: rounded message bubbles (small radius, ~10-12px), `--bg-card` background for incoming messages, `--accent` for the fan's own sent messages (or vice versa — pick one consistent side convention), Inter font matching the rest of the app, a rounded pill-shaped text input at the bottom matching the app's `Input` component.
3. This directly answers "is there chat" — yes, it exists in Daily, it just needs to be switched on and given the same visual treatment as everything else.

### Layout
- For a 1-on-1 call specifically (which is Haibu's only call type — no group calls in this product), consider a layout that isn't a plain even split — e.g. the local/self view as a smaller floating rounded tile in a corner over the main remote-participant view (the familiar "picture-in-picture" pattern most casual video apps use — FaceTime, Instagram video DMs, Discord calls all default to this for 1:1), rather than two equal rectangular halves side by side, which is the most Zoom-like arrangement possible. Daily's CSS injection can restyle tile sizing/positioning to achieve this; confirm feasibility with DeepSeek before committing to it as a requirement — if it proves to be a real fight against Daily's default grid layout logic, a clean even-two-tile split with full rounding and the accent speaking-ring is still a large improvement over the current state and an acceptable fallback.

---

## 3. What this Tier gets you, and its real ceiling

This should meaningfully close the gap between "feels like Zoom" and "feels like Haibu" — rounded tiles, a floating pill control bar, a real accent-colored speaking indicator, and a properly branded chat panel address the most visible, most-complained-about elements directly. **The honest ceiling**: you're still fundamentally working within Daily's DOM structure and interaction model — you can restyle what's there, but you can't invent entirely new interaction patterns (e.g., a non-standard tile shape like a circular avatar bubble instead of a rectangle, custom reaction animations, a fully bespoke layout) without hitting the edges of what CSS overrides on someone else's iframe can achieve.

---

## 4. Tier 2 (explicitly deferred, not ruled out) — full custom UI via Daily's callObject mode

Daily also offers a lower-level integration (`createCallObject()`) that hands you raw video/audio tracks and lets you build the entire UI yourself in React — full creative freedom, but real cost: you'd be responsible for building your own video tile rendering, your own control bar logic, reconnection handling, and chat from scratch via Daily's `sendAppMessage()`/`app-message` event API (confirmed real, documented capability — not a limitation, just more work).

**Do not build this now.** Tier 1 is a genuinely large improvement for a fraction of the engineering cost, and it hasn't been tried yet. Revisit Tier 2 only if, after Tier 1 ships and gets real human testing (same "you look at it yourself" standard as every other screen tonight), it still doesn't feel distinctive enough. Flag this in code as a noted future option, not a forgotten one.

---

## 5. Build sequence

1. Confirm the real, current Prebuilt chat-enable property name from live Daily docs.
2. Build the CSS override file/text covering: video tile radius + background, active-speaker ring, name tag pill, control bar restyle + floating positioning, chat panel restyle, loading-state copy/color.
3. Attempt the picture-in-picture self-view layout; fall back cleanly to an even rounded two-tile split if it fights Daily's layout engine too hard.
4. Real two-window test (same method used for the earlier video call verification) — this is a visual change, so real screenshots from an actual live two-participant session are required before calling it done, not a Playwright DOM check alone.

This is a real, moderate-sized visual+integration change — give a short plan before building (confirming the chat-enable property name, the CSS targets you've identified from inspecting Daily's actual rendered DOM, and the picture-in-picture feasibility check) rather than jumping straight to code.
