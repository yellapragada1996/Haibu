# Haibu — Call Screen Spec v2 (Feature-First, FaceTime-Fit)

> Supersedes the earlier `haibu-call-screen-redesign-spec.md`. That doc jumped straight to "make it look like Daily minus Zoom energy." This one starts from what the screen actually needs to do, then applies a FaceTime-inspired visual/interaction language on top — diverging from FaceTime deliberately wherever its own assumptions don't fit Haibu's actual context. Read Section 1 before Section 2; the feature list governs, the aesthetic serves it.

---

## 1. Feature needs — first principles, exhaustive

### 1.1 Core call mechanics (already built — keep)
- Camera on/off toggle
- Mic mute/unmute toggle
- Leave call (ends the local participant's session)
- Session title + live time-remaining countdown — **money-critical**, not cosmetic: both parties are inside a paid, time-bounded window and need to track it
- No-camera state showing the participant's avatar (real photo or initials fallback)

### 1.2 Text chat — KEEP, and treat as more essential than a generic video app would, not less
**This is the single most important divergence point from FaceTime, and it's worth being explicit about why.** FaceTime has no in-call chat panel — confirmed directly: Apple's entire model assumes two people who already know each other and have iMessage as a parallel, persistent channel outside the call itself. Text sent "during" a FaceTime call isn't a call feature at all, it's a separate app running alongside it.

**That assumption does not hold for Haibu.** A fan and creator are strangers. The build spec explicitly rules out any DM/messaging system between them outside of a booking (Section 13). **The in-call chat is the only text channel these two people will ever have, before, during, or after this session.** If it disappears, there is no fallback — no separate app, no other thread. That makes chat *more* load-bearing here than in almost any consumer video product, precisely opposite to what "just copy FaceTime" would suggest.

Chat must stay a clearly visible, persistent, easy-to-find control — not a buried/removed feature, and not something to minimize in the name of matching FaceTime's clean look.

### 1.3 Screen share — keep, real use case
Genuinely useful for the Music category specifically (sharing sheet music, a chord chart, a reference recording) and low-cost since Daily provides it natively. Keep available; doesn't need to be prominent for categories that won't use it (ASMR, casual talk).

### 1.4 Trust & safety — real gap, flag prominently, not an afterthought
**This was never addressed anywhere in tonight's build, and it should be, given the product.** Two strangers in a live, sometimes intimate-feeling (ASMR, casual talk) 1:1 session need a way to flag a problem *in the moment*, not only after the call ends via a page that doesn't exist yet (Step 12's report/block UI is still unbuilt). Recommend: **a Report control on the call screen itself**, technically feasible via Daily's real custom-tray-button capability (`customTrayButtons()`/`updateCustomTrayButtons()` — confirmed real API, lets us inject a bespoke button into Daily's own tray rather than building a separate overlay). This doesn't need Step 12's full moderation backend to exist yet — even a simple "flag and immediately leave" action that writes a bare `reports` row (booking_id, reporter, reason: "reported mid-call") is a meaningful v1 safety floor, and the UI slot for it should be reserved now rather than retrofitted later.

**Raghav: this needs an explicit decision** — build a real (if minimal) in-call Report action now, or consciously defer safety-reporting entirely to Step 12 and accept that a mid-call problem currently has no in-the-moment recourse. Not silently deciding either way.

### 1.5 Recording policy — verify, don't assume
Per the original build spec: no recording, off by default, ToS-prohibited only (no technical prevention claimed). **Concrete finding from research: Daily has a real config property, `enable_recording_ui`, that controls whether a Record button appears in Daily's own tray at all** — independent of whether recording is actually enabled on the room. If this was never explicitly set to `false`, Daily's default UI may be offering a Record button that contradicts our stated policy outright — not a passive risk, an active affordance sitting in the interface. **Check this directly and confirm — this is a real correctness gap to close, not a style question.**

### 1.6 Explicitly NOT needed — first-principles exclusions
- **Participants/People list** — every Haibu call is exactly two known people, always visible in their own tiles. A "who's here" list is dead weight carried over from Daily's multi-person-meeting defaults. Remove (per the prior round's already-raised recommendation — confirmed correct by this fuller analysis).
- Group-call features (breakout rooms, N-person grid, "add more people") — never applicable, Haibu calls are always 1:1.
- SharePlay / watch-together — not relevant to the product.
- New-call / contacts picker — irrelevant, Haibu's booking flow handles this entirely upstream.
- Camera-quality filters (Portrait mode, Studio Light, Center Stage) — real Apple features, genuinely nice, but a meaningful engineering lift for camera image processing with no v1 urgency. Not now.

---

## 2. Minimal FaceTime fit — applied on top of Section 1's needs

With the feature set locked, borrow FaceTime's *interaction and visual language*, not its feature list wholesale.

### 2.1 Adopt from FaceTime
- **Thin-stroke, minimal, refined icon style** — use the app's existing icon set (`lucide-react`), tuned to a lighter stroke weight for this screen. Not a second icon library.
- **Auto-hiding controls** — confirmed real FaceTime pattern ("if you don't see the controls, tap your screen"). The tray fades out after a few seconds of inactivity, reappears on mouse movement or tap. Cheap to implement (an opacity/visibility timer), genuinely reduces visual clutter, and is a real point of difference from every "always-on toolbar" conferencing app.
- **Full-bleed video, minimal visible chrome** — the video is the content; UI should recede when not actively needed, exactly FaceTime's philosophy.
- **Warm, personal tone in copy and loading states** — no clinical "Connecting to session," something with the same light personality already established elsewhere in the app (recall the Visualizer's loading-message guidance: a little character, never grim).
- **A genuinely dynamic accent-colored speaking indicator** — already correctly built in the prior round (tied to Daily's real speaking flag, not decorative).

### 2.2 Deliberately diverge from FaceTime
- **Persistent, easy-to-find chat** (Section 1.2) — FaceTime has none; Haibu needs one, for reasons FaceTime's context doesn't share.
- **A Report/safety affordance** (Section 1.4) — FaceTime has no equivalent because family/friends calling each other don't need one; two strangers in a paid session might.
- **No attempt at FaceTime's floating picture-in-picture self-view** — already confirmed technically infeasible via Daily's CSS-injection approach (Daily assigns tile sizes via inline JS that beats any stylesheet, and reflows its own grid unpredictably). The even, rounded two-tile layout already built is the correct, durable fallback — don't re-attempt PiP.

### 2.3 Noted for later, not v1
**FaceTime's Reactions** (double-tap or gesture-triggered playful overlay effects — confetti, balloons, etc.) is genuinely a strong stylistic fit for Haibu's "fun, not formal" brand goal, arguably more than anything else researched. Worth real consideration for v1.1/v2 once the core screen is stable — flag it, don't build it now.

---

## 3. What "done" looks like for this pass

1. Confirm/fix `enable_recording_ui: false` (Section 1.5) — quick, concrete, check first.
2. Explicit decision from Raghav on the Report control (Section 1.4) — build a minimal version now, or consciously defer.
3. Confirm chat remains a persistent, visible, working control — not diminished in the name of FaceTime minimalism.
4. Remove the People/participants button (Section 1.6).
5. Apply the FaceTime-style icon/auto-hide/tone treatment (Section 2.1) on top of the finalized button set.
6. Same standing rule as every prior round on this screen: full functional checklist re-run after any change, and a real human check (not just automated) before calling it done.
