"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

declare global {
  interface Window {
    DailyIframe?: {
      createFrame: (container: HTMLElement | null, opts: Record<string, unknown>) => DailyCall;
    };
  }
}

interface DailyCall {
  on: (event: string, cb: () => void) => void;
  join: () => Promise<void>;
  leave: () => void;
  destroy: () => void;
  setActiveSpeakerMode: (enabled: boolean) => void;
  loadCss: (opts: { bodyClass?: string; cssText?: string }) => void;
  participantCounts: () => { present: number };
}

function loadDailyScript(): Promise<void> {
  if (window.DailyIframe) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@daily-co/daily-js";
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

// Daily's exposed theming surface (dark theme matching the design system).
const DAILY_THEME = {
  colors: {
    background: "#121212",
    accent: "#A81120",
    accentText: "#FFFFFF",
    backgroundAccent: "#232323",
    baseText: "#FFFFFF",
    border: "#2A2A2A",
    mainAreaBg: "#121212",
    mainAreaBgAccent: "#232323",
    mainAreaText: "#8A8A8A",
    supportiveText: "#8A8A8A",
  },
};

// Tier 1 reskin (haibu-call-screen-redesign-spec.md §2): real CSS injection
// into Daily Prebuilt. Selectors verified against the live iframe DOM — they
// are Daily's current classes, not the documented-but-stale `.daily-video-*`
// names. NOTE (spec §4): Tier 2 custom UI via callObject is deferred, not ruled out.
const DAILY_CSS = `
/* --- Video tiles: rounded cards, neutral rest outline --- */
.tile {
  border-radius: 14px !important;
  overflow: hidden !important;
  background: #1E1E1E !important;
  position: relative !important;
  outline: 1px solid #2A2A2A !important;
}

/* Main (active-speaker) tile. OVERLAY MODEL (V1): the stage fills the full
   video container — the creator's media is the product. Self-view is a
   bottom-right corner PiP (see .fixed below), not a reserved column. Chat
   is a sibling sidebar that Daily pushes the stage with when opened. Video
   keeps object-fit: contain — no cropping. */
.tile:not(.local) {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  aspect-ratio: auto !important;
}

/* Self-view: an overlay PiP anchored to the bottom-right of the STAGE.
   .speaker is the positioning context; the self-view sidebar (a child of
   .speaker) fills it with pointer-events off, and .fixed re-enables pointer
   events and stacks above the stage. The chat sidebar is a SIBLING of
   .speaker (class .sidebar.hidden) and keeps Daily's native push behavior. */
.speaker {
  position: relative !important;
}

.speaker > .sidebar {
  position: absolute !important;
  inset: 0 !important;
  overflow: visible !important;
  pointer-events: none !important;
  z-index: 10 !important;
}

.fixed {
  position: absolute !important;
  top: auto !important;
  bottom: 16px !important;
  right: 16px !important;
  left: auto !important;
  transform: none !important;
  pointer-events: auto !important;
  z-index: 20 !important;
}

/* Small breathing gap between the chat drawer and the stage when chat is
   open. The chat sidebar is a sibling of .speaker under .main (not the
   self-view sidebar, which is .speaker > .sidebar). */
.main > .sidebar {
  margin-left: 4px !important;
}

/* Dismissible self-view: toggling the body class hide-self-view removes the
   corner PiP entirely for a pure media experience. */
body.hide-self-view .fixed {
  display: none !important;
}

/* Fullscreen (state 3): self-view hidden AND its reserved column released,
   so the stage reclaims 100% width with no dead gap. NOTE: fullscreen +
   chat-open (state 4) is intentionally NOT handled here — see the separate
   investigation; if the chat panel lives inside .sidebar this rule would
   hide chat too. */
html:fullscreen .fixed {
  display: none !important;
}

html:fullscreen .sidebar {
  display: none !important;
}

/* Speaking indicator: removed. Daily's marker tracks its static active slot,
   not genuine live speech — it can't be an accurate "who's talking now"
   signal without real audio-level data, which Prebuilt doesn't expose. Tiles
   get no accent treatment tied to speaking status; neutralize Daily's own
   dark marker outline as well. */
.tile[style*="outline"] {
  outline: none !important;
}

/* --- Camera-off state: centered avatar (photo or initials) on bg-card ---
   NOTE: the tile itself carries a "noVideo" STATE class, so every rule here
   is scoped to the inner .content > .noVideo div — a bare .noVideo
   selector would match the whole tile. */
.tile .content > .noVideo {
  position: absolute !important;
  inset: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: transparent !important;
  border-radius: 14px !important;
  padding: 0 !important;
  width: auto !important;
  height: auto !important;
  /* Daily positions this layer with translate(-50%,-50%) + top/left 50% —
     neutralize its transform so inset: 0 pins it to the tile. */
  transform: none !important;
  /* This is a display layer — never intercept pointer events. */
  pointer-events: none !important;
}

.tile .content > .noVideo.withAvatar img {
  width: 160px !important;
  height: 160px !important;
  border-radius: 999px !important;
  object-fit: cover !important;
  border: 3px solid rgba(255, 255, 255, 0.08) !important;
}

.tile .content > .noVideo:not(.withAvatar) strong {
  font-size: 22px !important;
  line-height: 28px !important;
  color: #8A8A8A !important;
  font-family: "Inter", system-ui, sans-serif !important;
}

/* Name tag: bottom-left pill. Daily renders the participant name inside
   .tile-info (.name) for BOTH camera states — restyle it as the pill and
   drop Daily's redundant mic chip. (Shrink-to-fit: never let this overlay
   cover the whole tile.) */
.tile-info {
  display: block !important;
  position: absolute !important;
  top: auto !important;
  right: auto !important;
  bottom: 10px !important;
  left: 10px !important;
  width: max-content !important;
  height: max-content !important;
  max-width: calc(100% - 20px) !important;
  background: rgba(0, 0, 0, 0.55) !important;
  border-radius: 999px !important;
  padding: 2px 12px !important;
  pointer-events: none !important;
}

.tile-info .info {
  display: block !important;
  position: static !important;
  width: auto !important;
  height: auto !important;
}

.tile-info .mic {
  display: none !important;
}

.tile-info .name {
  display: block !important;
  white-space: nowrap !important;
  overflow: visible !important;
  text-overflow: clip !important;
  font-size: 13px !important;
  line-height: 20px !important;
  color: #FFFFFF !important;
  font-family: "Inter", system-ui, sans-serif !important;
}

/* Icon-only tray: uniform 40px buttons, clusters aligned, icons centered */
.tray {
  left: 50% !important;
  transform: translateX(-50%) !important;
  /* Pinned relative to the call container, with a safe-area-aware offset so
     it stays fully visible in any real browser window */
  bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important;
  top: auto !important;
  width: auto !important;
  border-radius: 999px !important;
  background: #1A1A1A !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55) !important;
  padding: 8px 20px !important;
  display: flex !important;
  align-items: center !important;
}

.tray > div {
  display: flex !important;
  align-items: center !important;
  height: 40px !important;
}

.tray button {
  position: relative !important;
  width: 40px !important;
  height: 40px !important;
  min-width: 40px !important;
  max-width: 40px !important;
  margin: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* FaceTime-style auto-hiding controls: the page toggles the body class via
   loadCss() — body.idle fades the tray out and disables its hit area. */
.tray {
  transition: opacity 0.4s ease !important;
}

body.idle .tray {
  opacity: 0 !important;
  pointer-events: none !important;
}

.tray button span {
  display: none !important;
}

/* Icon-only control bar: Daily's labels are <p class="default"> elements */
.tray button {
  font-size: 0 !important;
}

.tray p {
  display: none !important;
}

[class*="robots-btn-"] {
  border-radius: 999px !important;
  /* Neutral dark fill for regular controls; accent reserved for Leave */
  background: #232323 !important;
}

/* Daily's device-selector corner buttons overlap the main cam/mic buttons
   and steal hit-tests — redundant chrome here, hidden with enough
   specificity to beat the blanket .tray button rules above. */
.tray .robots-btn-cam-devices,
.tray .robots-btn-audio-devices {
  display: none !important;
}

/* Screenshare stays visible (it's in the tooltip set) but its wrapper layers
   must not intercept hover/click — the container and its tooltip-anchor span
   pass pointer events through; only the button itself is interactive. */
.screen-share-controls {
  pointer-events: none !important;
}

.screen-share-controls > span {
  pointer-events: none !important;
}

.screen-share-controls button {
  pointer-events: auto !important;
}

/* Daily hides secondary tray buttons when it measures a narrow tray; our
   floating pill keeps the tray compact on purpose — keep them visible. */
.controls {
  width: auto !important;
  height: 40px !important;
  padding: 0 !important;
}

.controls,
.controls > div,
.controls > div > span,
.controls button {
  visibility: visible !important;
  opacity: 1 !important;
}

.controls > div,
.controls > div > span {
  display: flex !important;
  width: auto !important;
  height: auto !important;
}

.controls > div > span {
  width: 40px !important;
  height: 40px !important;
}

.controls > div > span > button {
  position: static !important;
}

/* Generic conferencing chrome that undercuts the design — hide it */
.settings-btn,
.robots-btn-grid-view-switch,
.robots-btn-speaker-view-noop,
.robots-btn-speaker-view-switch,
.robots-btn-grid-view-noop,
.view-switch,
.char-limit {
  display: none !important;
}

/* Participants/People list (spec v2 §1.6): every Haibu call is exactly two
   known people, always visible in their own tiles — remove the control. */
.tray .robots-btn-people-show,
.tray .people-controls {
  display: none !important;
}

/* Sidebar tab switcher: chat is the only panel (People is removed), and the
   chat tray button is the only path into the sidebar — no switcher needed. */
.tablist {
  display: none !important;
}

/* Unread badge: Daily's native .tray-badge renders PERMANENTLY regardless of
   messages (verified: visible at join and after open+close with zero
   messages) — it cannot serve as a real unread indicator, so hide it. A
   genuine unread badge requires Tier-2 custom chat messaging (v1.1). */
.tray .tray-badge {
  display: none !important;
}

.topbar [class*="default"],
.tabpanel [class*="default"] {
  display: none !important;
}

/* "Download chat" footer text (hash class observed in the live DOM) */
.jsx-3974783026.default {
  display: none !important;
}

[class*="robots-btn-"]:hover,
.button.ghost:hover {
  background: #2A2A2A !important;
}

/* Leave is the one destructive action — the only accent-filled control */
.robots-btn-leave {
  background: #A81120 !important;
  color: #FFFFFF !important;
}

.robots-btn-leave:hover {
  background: #C21329 !important;
}

/* --- Icon swap: hide Daily's glyphs, draw our own via CSS masks ---
   (icons live inside Daily's cross-origin iframe; direct SVG replacement is
   not possible, so each button gets a neutral mask-drawn glyph instead).
   Locked rule: white glyphs everywhere; red is reserved for Leave only. */

.robots-btn-cam-mute svg,
.robots-btn-cam-unmute svg,
.robots-btn-mic-mute svg,
.robots-btn-mic-unmute svg,
.robots-btn-people-show svg,
.robots-btn-chat-show svg,
.robots-btn-screenshare-start svg,
.robots-btn-leave svg,
.tray button[class*="visible"]:not([class*="robots-btn-"]) svg {
  visibility: hidden !important;
}

.robots-btn-cam-mute::before,
.robots-btn-cam-unmute::before,
.robots-btn-mic-mute::before,
.robots-btn-mic-unmute::before,
.robots-btn-people-show::before,
.robots-btn-chat-show::before,
.robots-btn-screenshare-start::before,
.robots-btn-leave::before,
.tray button[class*="visible"]:not([class*="robots-btn-"])::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  background-color: #FFFFFF;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

/* Camera ON (video-camera glyph — previously a photo camera, fixed) */
.robots-btn-cam-mute::before {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m22 8-6 4 6 4V8Z'/%3E%3Crect x='2' y='6' width='14' height='12' rx='2'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m22 8-6 4 6 4V8Z'/%3E%3Crect x='2' y='6' width='14' height='12' rx='2'/%3E%3C/svg%3E");
}

/* Camera OFF (video-camera glyph with slash) */
.robots-btn-cam-unmute::before {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m22 8-6 4 6 4V8Z'/%3E%3Crect x='2' y='6' width='14' height='12' rx='2'/%3E%3Cline x1='2' y1='2' x2='22' y2='22'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m22 8-6 4 6 4V8Z'/%3E%3Crect x='2' y='6' width='14' height='12' rx='2'/%3E%3Cline x1='2' y1='2' x2='22' y2='22'/%3E%3C/svg%3E");
}

/* Microphone ON */
.robots-btn-mic-mute::before {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z'/%3E%3Cpath d='M19 10v2a7 7 0 0 1-14 0v-2'/%3E%3Cline x1='12' y1='19' x2='12' y2='22'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z'/%3E%3Cpath d='M19 10v2a7 7 0 0 1-14 0v-2'/%3E%3Cline x1='12' y1='19' x2='12' y2='22'/%3E%3C/svg%3E");
}

/* Microphone OFF (muted) — neutral, no red */
.robots-btn-mic-unmute::before {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z'/%3E%3Cpath d='M19 10v2a7 7 0 0 1-14 0v-2'/%3E%3Cline x1='12' y1='19' x2='12' y2='22'/%3E%3Cline x1='2' y1='2' x2='22' y2='22'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z'/%3E%3Cpath d='M19 10v2a7 7 0 0 1-14 0v-2'/%3E%3Cline x1='12' y1='19' x2='12' y2='22'/%3E%3Cline x1='2' y1='2' x2='22' y2='22'/%3E%3C/svg%3E");
}

/* People */
.robots-btn-people-show::before {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E");
}

/* Chat */
.robots-btn-chat-show::before {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/%3E%3C/svg%3E");
}

/* Screen share */
.robots-btn-screenshare-start::before {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M13 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5'/%3E%3Cpath d='M8 21h8'/%3E%3Cpath d='M12 17v4'/%3E%3Cpath d='m17 8 5-5'/%3E%3Cpath d='M17 3h5v5'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M13 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5'/%3E%3Cpath d='M8 21h8'/%3E%3Cpath d='M12 17v4'/%3E%3Cpath d='m17 8 5-5'/%3E%3Cpath d='M17 3h5v5'/%3E%3C/svg%3E");
}

/* More */
.tray button[class*="visible"]:not([class*="robots-btn-"])::before {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='5' cy='12' r='1.8' fill='black'/%3E%3Ccircle cx='12' cy='12' r='1.8' fill='black'/%3E%3Ccircle cx='19' cy='12' r='1.8' fill='black'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='5' cy='12' r='1.8' fill='black'/%3E%3Ccircle cx='12' cy='12' r='1.8' fill='black'/%3E%3Ccircle cx='19' cy='12' r='1.8' fill='black'/%3E%3C/svg%3E");
}

/* Leave */
.robots-btn-leave::before {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91'/%3E%3Cline x1='22' y1='2' x2='2' y2='22'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91'/%3E%3Cline x1='22' y1='2' x2='2' y2='22'/%3E%3C/svg%3E");
}

/* --- Tooltips: descriptive labels replacing Daily's shortcut-only ones --- */
.tooltip {
  display: none !important;
}

.tray button:hover::after {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  background: #1E1E1E;
  color: #FFFFFF;
  font-size: 12px;
  font-family: "Inter", system-ui, sans-serif;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid #2A2A2A;
  white-space: nowrap;
  z-index: 60;
  pointer-events: none;
}

.robots-btn-cam-mute:hover::after,
.robots-btn-cam-unmute:hover::after { content: "Camera"; }

.robots-btn-mic-mute:hover::after,
.robots-btn-mic-unmute:hover::after { content: "Microphone"; }

.robots-btn-people-show:hover::after { content: "People"; }

.robots-btn-chat-show:hover::after { content: "Chat"; }

.robots-btn-screenshare-start:hover::after { content: "Screen share"; }

.tray button[class*="visible"]:not([class*="robots-btn-"]):hover::after { content: "More"; }

.robots-btn-leave:hover::after { content: "Leave call"; }

/* --- Chat: rounded bubbles + pill input --- */
.sidebar-panel {
  background: #1A1A1A !important;
}

.messages,
.messages-inner {
  background: #121212 !important;
}

/* Message bubbles: bg-card for incoming, accent for your own */
.messages-inner .msg {
  border-radius: 12px !important;
  background: #1E1E1E !important;
  color: #FFFFFF !important;
  padding: 8px 12px !important;
  font-family: "Inter", system-ui, sans-serif !important;
}

.messages-inner .msg.isLocal {
  background: #A81120 !important;
}

.tabpanel textarea,
.chat-input-wrapper textarea,
textarea[placeholder="Type a message…"] {
  border-radius: 999px !important;
  background: #121212 !important;
  border: 1px solid #2A2A2A !important;
  color: #FFFFFF !important;
  padding: 10px 16px !important;
  font-family: "Inter", system-ui, sans-serif !important;
}

body.haibu-call-theme {
  font-family: "Inter", system-ui, sans-serif;
}
`;

type Phase = "loading" | "too_early" | "ready" | "in_call" | "ended" | "error";

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Initials-on-accent avatar data URL for the camera-off state, matching the
// Avatar component's fallback look. Photo URLs (users.avatar_url) win.
function initialsAvatarDataUrl(name: string) {
  // A tiny SVG data URL instead of a canvas-rendered PNG: Daily caps the
  // `userData` payload at 4096 chars, and a 200x200 PNG (with anti-aliased
  // text) was ~4KB. The SVG is ~300 bytes and renders identically.
  const initials = initialsFor(name) || "H";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#A81120"/><text x="100" y="100" fill="#FFFFFF" font-size="80" font-weight="600" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function fmtCountdown(targetMs: number) {
  const remaining = Math.max(0, targetMs - Date.now());
  const s = Math.floor(remaining / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function SelfViewOnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SelfViewOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

export default function CallPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [countdown, setCountdown] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionEndAt, setSessionEndAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [controlsHidden, setControlsHidden] = useState(false);
  const [selfViewHidden, setSelfViewHidden] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<DailyCall | null>(null);
  const cssTextRef = useRef<string>(DAILY_CSS);
  const startInFlightRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;

  const startCall = useCallback(async () => {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    try {
      const res = await fetch(`/api/meetings/token?bookingId=${bookingId}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "too early" && data.join_start_at) {
          setPhase("too_early");
          startCountdown(new Date(data.join_start_at).getTime());
          return;
        }
        setPhase("error");
        setError(data.error ?? "Failed to join");
        return;
      }

      setSessionTitle(data.session_title ?? "Session");
      if (data.session_end_at) {
        setSessionEndAt(new Date(data.session_end_at).getTime());
      }

      // Defensive: never hand Daily a malformed config — fail cleanly instead
      // of throwing "url should be a string" mid-construction.
      if (
        typeof data.room_url !== "string" ||
        !data.room_url ||
        typeof data.token !== "string" ||
        !data.token
      ) {
        setPhase("error");
        setError("Session link not ready yet — try again in a moment.");
        return;
      }

      await loadDailyScript();
      const DailyIframe = window.DailyIframe!;

      // Debug-only layout outlines (?debug-layout=1 on the call URL): bright
      // green on the STAGE tile, bright blue on SELF-VIEW, magenta on the
      // sidebar — colors that exist nowhere else in the real UI, so overlap
      // is unmistakable in screenshots. Inert without the query param.
      const debugLayout =
        new URLSearchParams(window.location.search).has("debug-layout");
      const cssText = debugLayout
        ? DAILY_CSS +
          `
/* DEBUG LAYOUT OUTLINES (dev only, ?debug-layout=1) */
.tile:not(.local) { outline: 3px solid #00FF00 !important; outline-offset: -3px !important; }
.fixed .tile.local { outline: 3px solid #0000FF !important; outline-offset: -3px !important; }
.sidebar { outline: 3px solid #FF00FF !important; outline-offset: -3px !important; }
`
        : DAILY_CSS;
      // Keep the composed cssText for the auto-hide loadCss calls.
      cssTextRef.current = cssText;

      // StrictMode double-invokes effects in dev; never create a second
      // DailyIframe while one exists.
      if (frameRef.current) {
        frameRef.current.destroy();
        frameRef.current = null;
      }
      if (!containerRef.current) return;

      const frame = DailyIframe.createFrame(containerRef.current, {
        url: data.room_url,
        token: data.token,
        showLeaveButton: true,
        showFullscreenButton: true,
        theme: DAILY_THEME,
        bodyClass: "haibu-call-theme",
        cssText,
        // Camera-off avatar (photo if set, initials-on-accent otherwise) —
        // Daily renders it in the participant's tile when video is off.
        userData: {
          avatar: data.avatar_url || initialsAvatarDataUrl(data.display_name || "User"),
          userName: data.display_name || "User",
        },
        // The container is display:none while the frame is created; give the
        // iframe explicit percentage sizing so it tracks the container once
        // it becomes visible (Daily's default sizing produced a 150px iframe).
        iframeStyle: {
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
        },
      });

      frameRef.current = frame;

      frame.on("left-meeting", () => {
        setPhase("ended");
      });

      await frame.join();
      // Native Active Speaker view (Daily's default): Daily's own layout
      // engine sizes the tiles — large main tile for the active speaker,
      // smaller self-view. No forced CSS tile sizing.
      frame.setActiveSpeakerMode(true);
      setPhase("in_call");

      // Self-view only exists when there's a remote participant (with just
      // the local user, the single tile is the stage). Track the count so
      // the self-view toggle is only shown when there's a PiP to hide.
      const updateParticipants = () => {
        setHasRemote((frame.participantCounts?.()?.present ?? 0) >= 2);
      };
      frame.on("participant-joined", updateParticipants);
      frame.on("participant-left", updateParticipants);
      updateParticipants();

      const now = Date.now();
      const joinEnd = now + 3600000;
      endTimerRef.current = setTimeout(() => {
        frameRef.current?.leave();
        setPhase("ended");
      }, joinEnd - now);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Call failed");
    } finally {
      startInFlightRef.current = false;
    }
  }, [bookingId]);

  function startCountdown(targetMs: number) {
    const tick = () => {
      const remaining = targetMs - Date.now();
      if (remaining <= 0) {
        setCountdown("");
        startCall();
        return;
      }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }

  useEffect(() => {
    startCall();
    return () => {
      clearTimeout(endTimerRef.current);
      frameRef.current?.destroy();
    };
  }, [startCall]);

  // Live "time remaining" ticker while in call
  useEffect(() => {
    if (phase !== "in_call" || !sessionEndAt) return;
    const tick = () => {
      const remaining = sessionEndAt - Date.now();
      if (remaining <= 0) {
        setTimeLeft("0:00");
        frameRef.current?.leave();
        return;
      }
      setTimeLeft(fmtCountdown(sessionEndAt));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [phase, sessionEndAt]);

  // Second layer of protection against accidentally leaving a paid session:
  // browser-level confirm on navigate-away/tab-close while in call.
  useEffect(() => {
    if (phase !== "in_call") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  // FaceTime-style auto-hiding controls (spec v2 §2.1): the Daily tray hides
  // when the pointer leaves the page for 4s or the window loses focus, and
  // returns instantly on any pointer activity (or via the wake layer's first
  // move/tap while hidden).
  //
  // Constraint: the parent page cannot observe pointer activity INSIDE the
  // cross-origin iframe (and Daily exposes no iframe-mousemove event), so the
  // hide timer only starts when the pointer leaves the PAGE entirely — the
  // tray stays visible whenever the user is actually present. UI-only —
  // loadCss swaps CSS and never touches join/connection state.
  const hiddenRef = useRef(false);
  const selfViewHiddenRef = useRef(false);
  const wakeRef = useRef<() => void>(() => {});
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (phase !== "in_call") return;

    const bodyClass = (idle: boolean) =>
      "haibu-call-theme" +
      (idle ? " idle" : "") +
      (selfViewHiddenRef.current ? " hide-self-view" : "");

    const show = () => {
      clearTimeout(idleTimerRef.current);
      if (hiddenRef.current) {
        hiddenRef.current = false;
        setControlsHidden(false);
        frameRef.current?.loadCss({ bodyClass: bodyClass(false), cssText: cssTextRef.current });
      }
    };
    const hide = () => {
      clearTimeout(idleTimerRef.current);
      hiddenRef.current = true;
      setControlsHidden(true);
      frameRef.current?.loadCss({ bodyClass: bodyClass(true), cssText: cssTextRef.current });
    };
    const armTimer = () => {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(hide, 4000);
    };

    wakeRef.current = show;
    show();

    window.addEventListener("mousemove", show);
    window.addEventListener("blur", hide);
    document.addEventListener("mouseleave", armTimer);

    return () => {
      clearTimeout(idleTimerRef.current);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("blur", hide);
      document.removeEventListener("mouseleave", armTimer);
      if (hiddenRef.current) {
        hiddenRef.current = false;
        setControlsHidden(false);
        frameRef.current?.loadCss({
          bodyClass:
            "haibu-call-theme" +
            (selfViewHiddenRef.current ? " hide-self-view" : ""),
          cssText: cssTextRef.current,
        });
      }
    };
  }, [phase]);

  const toggleSelfView = () => {
    const next = !selfViewHiddenRef.current;
    selfViewHiddenRef.current = next;
    setSelfViewHidden(next);
    frameRef.current?.loadCss({
      bodyClass:
        "haibu-call-theme" +
        (hiddenRef.current ? " idle" : "") +
        (next ? " hide-self-view" : ""),
      cssText: cssTextRef.current,
    });
  };

  const handleLeave = () => {
    frameRef.current?.leave();
  };

  const backButton = (
    <Button variant="secondary" onClick={() => router.push(`/bookings/${bookingId}`)}>
      Back to booking
    </Button>
  );

  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
        <div className="text-center">
          <p className="text-lg text-white">{error}</p>
          <div className="mt-4">{backButton}</div>
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
        <div className="text-center">
          <p className="text-lg text-white">Session ended</p>
          <div className="mt-4">{backButton}</div>
        </div>
      </div>
    );
  }

  if (phase === "too_early") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
        <div className="text-center">
          <p className="text-lg text-white">Session hasn&apos;t started yet</p>
          <p className="mt-2 font-mono text-3xl text-white">{countdown}</p>
          <p className="mt-2 text-sm text-text-secondary">
            Call will start automatically when the join window opens
          </p>
          <div className="mt-6">{backButton}</div>
        </div>
      </div>
    );
  }

  return (
    // Full viewport — this route has NO site NavBar (minimal call layout);
    // the Daily tray pins to the real bottom edge, safe-area aware.
    <div className="flex h-dvh flex-col overflow-hidden bg-bg-base">
      {/* Minimal chrome header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle bg-bg-surface px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{sessionTitle || "Session"}</p>
          <p className="text-xs text-text-secondary">
            {phase === "in_call" ? "Live" : "Getting you in…"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {phase === "in_call" && sessionEndAt && (
            <span className="font-mono text-sm text-text-secondary">{timeLeft}</span>
          )}
          {phase === "in_call" && (
            <Button size="small" onClick={handleLeave}>
              Leave
            </Button>
          )}
        </div>
      </header>

      {(phase === "ready" || phase === "loading") && (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-medium text-accent">Making things cozy…</p>
        </div>
      )}

      {/* CRITICAL: React renders NOTHING inside containerRef — Daily appends
          its iframe there, and React's reconciliation can otherwise remove
          the iframe DOM node while Daily's JS instance survives (causing
          "Duplicate DailyIframe instances" + torn-frame errors). The wake
          layer lives as a SIBLING overlay instead. */}
      <div className={phase === "in_call" ? "relative flex-1 min-h-0" : "hidden"}>
        <div ref={containerRef} className="absolute inset-0" />
        {phase === "in_call" && (
          <div
            className="absolute inset-0 z-10"
            style={{ pointerEvents: controlsHidden ? "auto" : "none" }}
            onMouseMove={() => wakeRef.current()}
            onMouseDown={() => wakeRef.current()}
            onTouchStart={() => wakeRef.current()}
          />
        )}
        {phase === "in_call" && hasRemote && (
          <button
            type="button"
            onClick={toggleSelfView}
            aria-label={selfViewHidden ? "Show self-view" : "Hide self-view"}
            title={selfViewHidden ? "Show self-view" : "Hide self-view"}
            className="absolute right-[168px] bottom-[143px] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-bg-surface text-white shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition-opacity duration-300 hover:bg-bg-card-hover"
          >
            {selfViewHidden ? <SelfViewOffIcon /> : <SelfViewOnIcon />}
          </button>
        )}
      </div>
    </div>
  );
}
