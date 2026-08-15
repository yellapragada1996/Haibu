# Haibu — Call Screen Layout Spec (Final, Corrected)

> This supersedes every prior instruction on self-view positioning tonight, including the "small overlay anchored to the stage's corner" model. That model is confirmed, via DeepSeek's own measured `getBoundingClientRect` evidence, to have self-view sitting entirely inside the stage tile's footprint in every state — a real, structural overlap, not a positioning nuance. This document replaces it with a genuinely non-overlapping model. Do not deviate from this without checking with us first.

---

## 1. Why the overlay model is wrong for this product

The overlay pattern (self-view floating on top of the main video, like FaceTime/Zoom/Meet) is standard for apps built around **mutual, ongoing personal connection** — two people who both want to see each other and don't mind a small version of themselves in the corner.

**Haibu is not that.** A fan is paying to experience a creator's performance — ASMR, music, a lesson. The creator's video is the product being consumed. Any part of that video covered by a self-view tile, even a small corner, is actively degrading what the fan paid for. The overlay pattern was the wrong reference point; it was adopted without checking whether Haibu's actual use case matched the apps it came from, and it doesn't.

## 2. The corrected model: three genuinely separate regions, zero overlap

Not an overlay. A reserved-column layout: the stage's own video container is **always narrower than the full available width**, permanently reserving a strip for self-view. Daily's video renders `object-fit: contain` inside whatever box its container is — so if the container itself excludes the self-view strip, the video physically cannot render into that space. Correctness becomes structural, not something recalculated and re-verified by hand every round.

### Chat closed
- **STAGE**: fills all available width **except** a reserved right-side strip of `self-view width + 32px` (16px gap on each side of self-view within that strip).
- **SELF-VIEW**: sits inside that reserved strip, 16px from the container's top, positioned in the strip (not on the stage).
- A real, visible gap of at least 16px exists between the stage's right edge and self-view's left edge at all times.

### Chat open
- **STAGE** narrows further to also exclude the chat panel's width.
- **SELF-VIEW** stays in its reserved strip, now sitting between the (narrower) stage and the chat panel — 16px gap to the stage on its left, 16px gap to the chat panel on its right.
- **CHAT PANEL** keeps Daily's native width, unchanged.
- All three regions — stage, self-view, chat — sit left to right with real gaps between every pair. None ever touch or overlap.

### The exact math, so there's no ambiguity
Given total available width `W` (the call container, minus 40px outer margin per side if applicable):
- Self-view fixed size: use its current real dimensions (192×108, per Daily's default — do not change this).
- Reserved self-view strip width: `192 + 32 = 224px` (16px margin each side).
- Chat panel width: Daily's native width, measured live, never hardcoded (per the stale-property-name lessons from tonight).
- **Stage width, chat closed**: `W - 224`.
- **Stage width, chat open**: `W - 224 - chatPanelWidth`.
- Self-view's position: always 16px from the top of the container, and always horizontally centered or left-aligned within its 224px reserved strip (a 16px margin on each side of the 192px tile naturally centers it — confirm this holds, don't hardcode a separate horizontal offset).

## 3. Required before implementation

1. **Confirm the stage's current `width: 100%` rule can be safely changed to a calculated value** (`calc(100% - 224px)` closed, `calc(100% - 224px - chatPanelWidth)` open) without breaking the edge-to-edge, no-cropping fix from earlier tonight. The video must still fill its (now narrower) container with `object-fit: contain`, no cropping, no letterboxing artifacts.
2. **Use the two permanent tools already built** for verification, not a new approach:
   - The rect-intersection check (`test-call-layout-overlap.js`) must flip from `FAIL` to `PASS` once this is implemented — stage and self-view rects must be fully disjoint, confirmed by real measurement, not assumed.
   - The colored-outline debug mode (`?debug-layout=1`) must show a clear gap between the green stage outline and the blue self-view outline in a real screenshot, both states — no touching, no overlap, visible whitespace between them.
3. **Test in headed (non-headless) browser**, both fan and creator windows, per the standing rule established earlier tonight for this feature.
4. **Fullscreen remains out of scope** for this pass, exactly as before — self-view is hidden entirely in fullscreen (already implemented), which sidesteps this whole question there.

## 4. What "done" looks like

A real screenshot, in a real headed browser, showing: the stage (narrower than before, video still fully visible and uncropped), a clear gap of visible page background, then self-view sitting cleanly in its own space — in both chat-closed and chat-open states. The rect-intersection check reports `PASS`. The colored-outline mode shows two outlines that never touch.
