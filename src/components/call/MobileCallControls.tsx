"use client";

// Our own mobile call controls (replaces Daily's native tray on small
// viewports, where Daily's mobile DOM doesn't match the injected desktop CSS).
// Pure presentational: the parent owns camera/mic state and Daily frame calls.

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="22" y1="2" x2="2" y2="22" />
    </svg>
  );
}

export function MobileCallControls({
  cameraOn,
  micOn,
  onToggleCamera,
  onToggleMic,
  onLeave,
  hidden,
}: {
  cameraOn: boolean;
  micOn: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onLeave: () => void;
  hidden: boolean;
}) {
  const activeBg = "bg-white text-on-primary";
  const inactiveBg = "bg-bg-card-hover text-white";

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-30 flex justify-center pb-[calc(20px+env(safe-area-inset-bottom,0px))] transition-opacity duration-300 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex items-center gap-2.5 rounded-pill border border-border-subtle bg-bg-surface/95 px-4 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          onClick={onToggleCamera}
          aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            cameraOn ? inactiveBg : activeBg
          }`}
        >
          <CameraIcon />
        </button>
        <button
          type="button"
          onClick={onToggleMic}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            micOn ? inactiveBg : activeBg
          }`}
        >
          <MicIcon />
        </button>
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave call"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-on-primary transition-colors hover:bg-bg-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <LeaveIcon />
        </button>
      </div>
    </div>
  );
}
