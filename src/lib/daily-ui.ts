// Daily.co Prebuilt integration config.
// Raw hex is a documented exception here: these values are passed to Daily's
// API (DAILY_THEME) or injected into its cross-origin iframe (DAILY_CSS) and
// cannot reference the app's @theme CSS variables. See haibu-design-token-system.md.

export const DAILY_THEME = {
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

export const DAILY_CSS = `
/* --- Video tiles: rounded cards, neutral rest outline --- */
.tile {
  border-radius: 14px !important;
  overflow: hidden !important;
  background: #1E1E1E !important;
  position: relative !important;
  outline: 1px solid #2A2A2A !important;
}

/* Daily's <video> is ~4px larger than the tile and has sharp corners — round
   it and clip the content wrapper so nothing pokes past the tile's corners. */
.tile .content {
  border-radius: 14px !important;
  overflow: hidden !important;
}

.tile video {
  border-radius: 14px !important;
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
  /* Daily's PiP wrapper has a dark square background with sharp corners that
     peeks out around/under the rounded tile — clear + clip it. */
  background: transparent !important;
  border-radius: 14px !important;
  overflow: hidden !important;
}

/* Tile hover menu (three dots → pin/remove participant): 1:1 calls don't
   need it. */
.tile-actions {
  display: none !important;
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

/* Fullscreen (media-first): remove the self-view entirely — the creator's
   video is the product, no PiP, no self-view toggle. Chat stays available
   as a side drawer (.main > .sidebar). The fullscreen state is applied as a
   body class from JS (fullscreenchange) — Daily fullscreens a wrapper, so
   html:fullscreen never matches inside the iframe. */
body.fullscreen .fixed {
  display: none !important;
}

body.fullscreen .speaker > .sidebar {
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
  background: transparent !important;
  border-radius: 0 !important;
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
  /* Transparent controls — icons sit directly on the tray, no dark squares;
     accent reserved for Leave. */
  background: transparent !important;
}

/* Daily's own glyph backgrounds (a red rounded square on cam/mic "off" and a
   filled chat bubble) would otherwise show behind our mask-drawn icons. */
.tray button svg {
  background: transparent !important;
  border-radius: 0 !important;
}

/* Daily's control wrappers (.av-controls holds cam/mic, .secondary-controls
   holds leave/screenshare) carry a dark square background — clear it so the
   icons sit directly on the tray pill. */
.av-controls,
.secondary-controls {
  background: transparent !important;
  border-radius: 0 !important;
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

/* Leave call — white fill (stands out from the neutral tray, not red) */
.robots-btn-leave {
  background: #FFFFFF !important;
  color: #121212 !important;
}

.robots-btn-leave:hover {
  background: #E8E8E8 !important;
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
.robots-btn-chat-hide svg,
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
.robots-btn-chat-hide::before,
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

/* Chat (show and hide/active states both use our outline glyph) */
.robots-btn-chat-show::before,
.robots-btn-chat-hide::before {
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

/* Leave (dark glyph on the white fill) */
.robots-btn-leave::before {
  background-color: #121212 !important;
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

/* --- Mobile (≤640px): full-screen portrait stage, small top-right PiP,
   chat as a bottom sheet --- */
@media (max-width: 640px) {
  /* Hide Daily's native topbar (an empty 25-33px strip); the React header
     already shows the session title. This also makes the speaker start at
     y=0 so the self-view PiP's top is a stable 16px from the top in both
     narrow-desktop and mobile-UA rendering. */
  .topbar {
    display: none !important;
  }

  /* On mobile we render our own React control bar — hide Daily's native
     tray entirely (its mobile DOM doesn't match the desktop re-skin). */
  .tray {
    display: none !important;
  }

  /* Keep the stage full width even while chat is open (Daily narrows it to
     88px to make room for a side panel; we overlay chat as a bottom sheet). */
  .speaker {
    width: 100% !important;
    flex: 1 1 auto !important;
  }

  .fixed {
    top: calc(16px + env(safe-area-inset-top, 0px)) !important;
    bottom: auto !important;
    right: 16px !important;
    width: 110px !important;
    height: 62px !important;
    overflow: hidden !important;
  }

  /* The tile (and its video) inside .fixed stays 192x108 otherwise — shrink
     it too so nothing overflows the smaller PiP and gets clipped at the edge. */
  .fixed .tile {
    width: 110px !important;
    height: 62px !important;
    max-width: 110px !important;
    max-height: 62px !important;
  }

  /* Chat: overlay bottom sheet instead of a full-width side panel that
     squeezes the stage and pushes the self-view off-screen. */
  .main > .sidebar:not(.hidden) {
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    bottom: 0 !important;
    height: 55% !important;
    width: 100% !important;
    z-index: 30 !important;
  }
}
`;

export const DAILY_DEBUG_CSS = `
/* DEBUG LAYOUT OUTLINES (dev only, ?debug-layout=1) */
.tile:not(.local) { outline: 3px solid #00FF00 !important; outline-offset: -3px !important; }
.fixed .tile.local { outline: 3px solid #0000FF !important; outline-offset: -3px !important; }
.sidebar { outline: 3px solid #FF00FF !important; outline-offset: -3px !important; }
`;

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
export function initialsAvatarDataUrl(name: string) {
  // A tiny SVG data URL instead of a canvas-rendered PNG: Daily caps the
  // `userData` payload at 4096 chars, and a 200x200 PNG (with anti-aliased
  // text) was ~4KB. The SVG is ~300 bytes and renders identically.
  const initials = initialsFor(name) || "H";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#232323"/><text x="100" y="100" fill="#FFFFFF" font-size="80" font-weight="600" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
