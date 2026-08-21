"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { MobileCallControls } from "@/components/call/MobileCallControls";
import { useMediaQuery } from "@/hooks/useMediaQuery";

declare global {
  interface Window {
    DailyIframe?: {
      createFrame: (container: HTMLElement | null, opts: Record<string, unknown>) => DailyCall;
    };
  }
}

interface DailyCall {
  on: (event: string, cb: (data?: unknown) => void) => void;
  join: () => Promise<void>;
  leave: () => void;
  destroy: () => void;
  setActiveSpeakerMode: (enabled: boolean) => void;
  loadCss: (opts: { bodyClass?: string; cssText?: string }) => void;
  participantCounts: () => { present: number };
  localAudio: () => boolean;
  localVideo: () => boolean;
  setLocalAudio: (enabled: boolean) => void;
  setLocalVideo: (enabled: boolean) => void;
}

function loadDailyScript(): Promise<void> {
  if (window.DailyIframe) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@daily-co/daily-js@0.92.2";
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

import { DAILY_THEME, DAILY_CSS, DAILY_DEBUG_CSS, initialsAvatarDataUrl } from "@/lib/daily-ui";

type Phase = "loading" | "too_early" | "ready" | "in_call" | "ended" | "error";

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selfViewHidden, setSelfViewHidden] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [error, setError] = useState("");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const isMobile = useMediaQuery("(max-width: 640px)");
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
      const cssText = debugLayout ? DAILY_CSS + DAILY_DEBUG_CSS : DAILY_CSS;
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
        showFullscreenButton: false,
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
      setCameraOn(frame.localVideo());
      setMicOn(frame.localAudio());
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
  const fullscreenRef = useRef(false);
  const selfViewHiddenRef = useRef(false);
  const wakeRef = useRef<() => void>(() => {});
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (phase !== "in_call") return;

    const bodyClass = (idle: boolean) =>
      "haibu-call-theme" +
      (idle ? " idle" : "") +
      (selfViewHiddenRef.current ? " hide-self-view" : "") +
      (fullscreenRef.current ? " fullscreen" : "");

    const show = () => {
      clearTimeout(idleTimerRef.current);
      if (hiddenRef.current) {
        hiddenRef.current = false;
        setControlsHidden(false);
        frameRef.current?.loadCss({ bodyClass: bodyClass(false), cssText: cssTextRef.current });
      }
      armTimer();
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
    window.addEventListener("touchstart", show);
    window.addEventListener("blur", hide);

    return () => {
      clearTimeout(idleTimerRef.current);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("touchstart", show);
      window.removeEventListener("blur", hide);
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

  // Track browser fullscreen state so the injected Daily CSS can hide the
  // self-view in fullscreen (applied as a body class, not html:fullscreen).
  useEffect(() => {
    if (phase !== "in_call") return;
    const onFullscreenChange = () => {
      fullscreenRef.current = document.fullscreenElement != null;
      setIsFullscreen(fullscreenRef.current);
      frameRef.current?.loadCss({
        bodyClass:
          "haibu-call-theme" +
          (hiddenRef.current ? " idle" : "") +
          (selfViewHiddenRef.current ? " hide-self-view" : "") +
          (fullscreenRef.current ? " fullscreen" : ""),
        cssText: cssTextRef.current,
      });
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [phase]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (containerRef.current?.parentElement) {
      // Fullscreen the wrapper (not just the iframe) so the wake layer stays
      // in fullscreen and can detect pointer movement to wake the controls.
      void containerRef.current.parentElement.requestFullscreen();
    }
  };

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

  // Track the chat panel's open/close state via Daily's "sidebar-view-changed"
  // postMessage (view === "chat" means open). The self-view PiP shifts left
  // when the chat narrows the stage, so the toggle needs to follow it.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data as { action?: string; view?: string } | null;
      if (data && data.action === "sidebar-view-changed") {
        setChatOpen(data.view === "chat");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleLeave = () => {
    frameRef.current?.leave();
  };

  const toggleCamera = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const next = !cameraOn;
    frame.setLocalVideo(next);
    setCameraOn(next);
  };

  const toggleMic = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const next = !micOn;
    frame.setLocalAudio(next);
    setMicOn(next);
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
      <header
        className={`flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle bg-bg-surface px-4 transition-opacity duration-300 ${
          isMobile && controlsHidden ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
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
          <p className="font-medium text-text-secondary">Making things cozy…</p>
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
        {phase === "in_call" && !isMobile && hasRemote && !isFullscreen && (
          <button
            type="button"
            onClick={toggleSelfView}
            aria-label={selfViewHidden ? "Show self-view" : "Hide self-view"}
            title={selfViewHidden ? "Show self-view" : "Hide self-view"}
            className={`absolute bottom-[150px] z-20 flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface text-white shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition-colors hover:bg-bg-card-hover ${
              chatOpen ? "right-[481px]" : "right-[175px]"
            } max-sm:bottom-auto max-sm:top-[17px] max-sm:right-[93px]`}
          >
            {selfViewHidden ? <SelfViewOffIcon /> : <SelfViewOnIcon />}
          </button>
        )}
        {phase === "in_call" && !isMobile && (!isFullscreen || !controlsHidden) && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="absolute top-4 left-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-bg-surface text-white shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition-colors hover:bg-bg-card-hover"
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        )}
        {phase === "in_call" && isMobile && (
          <MobileCallControls
            cameraOn={cameraOn}
            micOn={micOn}
            onToggleCamera={toggleCamera}
            onToggleMic={toggleMic}
            onLeave={handleLeave}
            hidden={controlsHidden}
          />
        )}
      </div>
    </div>
  );
}
