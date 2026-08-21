"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { initialsAvatarDataUrl } from "@/lib/daily-ui";
import { DailyCall, DailyParticipant } from "@/lib/daily-types";

// ---------------------------------------------------------------------------
// Mobile custom call UI (call-object mode). Daily's Prebuilt iframe UI is NOT
// used here — we render our own tiles and controls from Daily's documented
// track API, so the layout and controls are fully under our control and don't
// depend on Daily's internal DOM/class names.
// ---------------------------------------------------------------------------

type Phase = "loading" | "too_early" | "in_call" | "ended" | "error";

interface TrackEvent {
  participant?: DailyParticipant | null;
  track: MediaStreamTrack;
  type: string;
}

function loadDailyScript(): Promise<void> {
  if (window.DailyIframe) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@daily-co/daily-js@0.92.2";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Daily"));
    document.head.appendChild(s);
  });
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

function addTrackTo(el: HTMLVideoElement | HTMLAudioElement | null, track: MediaStreamTrack) {
  if (!el) return;
  const stream = (el.srcObject as MediaStream | null) ?? new MediaStream();
  stream.addTrack(track);
  el.srcObject = stream;
  el.play().catch(() => {});
}

function removeTrackFrom(el: HTMLVideoElement | HTMLAudioElement | null, track: MediaStreamTrack) {
  const stream = el?.srcObject as MediaStream | undefined;
  if (!stream) return;
  stream.removeTrack(track);
}

export function CustomMobileCall({ bookingId }: { bookingId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [countdown, setCountdown] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionEndAt, setSessionEndAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [remoteName, setRemoteName] = useState("");
  const [localName, setLocalName] = useState("");
  const [localAvatar, setLocalAvatar] = useState("");
  const [remoteAvatar, setRemoteAvatar] = useState("");
  const [cleanView, setCleanView] = useState(false);
  const [error, setError] = useState("");

  const callRef = useRef<DailyCall | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startedRef = useRef(false);

  const router = useRouter();

  const startCall = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    try {
      const res = await fetch(`/api/meetings/token?bookingId=${bookingId}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "too early" && data.join_start_at) {
          setPhase("too_early");
          const target = new Date(data.join_start_at).getTime();
          const tick = () => {
            const remaining = target - Date.now();
            if (remaining <= 0) {
              setCountdown("");
              setPhase("loading");
              startedRef.current = false;
              void startCall();
              return;
            }
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            setCountdown(`${m}:${s.toString().padStart(2, "0")}`);
          };
          tick();
          const iv = setInterval(() => {
            if (Date.now() >= target) clearInterval(iv);
            else tick();
          }, 1000);
          return;
        }
        setPhase("error");
        setError(data.error ?? "Failed to join");
        return;
      }

      if (typeof data.room_url !== "string" || !data.room_url) {
        setPhase("error");
        setError("Session link not ready yet — try again in a moment.");
        return;
      }

      setSessionTitle(data.session_title ?? "Session");
      setLocalName(data.display_name ?? "User");
      setLocalAvatar(data.avatar_url || initialsAvatarDataUrl(data.display_name || "User"));
      if (data.session_end_at) {
        setSessionEndAt(new Date(data.session_end_at).getTime());
      }

      await loadDailyScript();
      const DailyIframe = window.DailyIframe!;

      if (callRef.current) {
        callRef.current.destroy();
        callRef.current = null;
      }

      const call = DailyIframe.createCallObject({
        url: data.room_url,
        ...(data.token ? { token: data.token } : {}),
        subscribeToTracksAutomatically: true,
        userData: {
          avatar: data.avatar_url || initialsAvatarDataUrl(data.display_name || "User"),
          userName: data.display_name || "User",
        },
      });
      callRef.current = call;

      call.on("track-started", (e) => {
        const ev = e as TrackEvent;
        const isLocal = !!ev.participant?.local;
        if (ev.type === "video") {
          addTrackTo(isLocal ? selfVideoRef.current : remoteVideoRef.current, ev.track);
          if (isLocal) setCameraOn(true);
          else setRemoteHasVideo(true);
        } else if (ev.type === "audio" && !isLocal) {
          addTrackTo(audioRef.current, ev.track);
        }
      });

      call.on("track-stopped", (e) => {
        const ev = e as TrackEvent;
        const isLocal = !!ev.participant?.local;
        if (ev.type === "video") {
          removeTrackFrom(isLocal ? selfVideoRef.current : remoteVideoRef.current, ev.track);
          if (isLocal) setCameraOn(false);
          else setRemoteHasVideo(false);
        } else if (ev.type === "audio" && !isLocal) {
          removeTrackFrom(audioRef.current, ev.track);
        }
      });

      call.on("participant-joined", (e) => {
        const p = e as { participant?: DailyParticipant };
        if (p.participant && !p.participant.local) {
          setRemoteName(p.participant.user_name || "Guest");
          setRemoteAvatar(
            p.participant.userData?.avatar || initialsAvatarDataUrl(p.participant.user_name || "Guest"),
          );
        }
      });

      call.on("participant-updated", (e) => {
        const p = e as { participant?: DailyParticipant };
        if (p.participant && !p.participant.local) {
          setRemoteName(p.participant.user_name || remoteName || "Guest");
        }
      });

      call.on("left-meeting", () => {
        setPhase("ended");
      });

      call.on("error", (e) => {
        const err = e as { errorMsg?: string };
        setError(err.errorMsg ?? "Call error");
      });

      await call.join();

      // Track the existing participants (covers the case where the remote
      // joined before us and track events already fired).
      const participants = call.participants();
      const remote = Object.values(participants).find((p) => !p.local);
      if (remote) {
        setRemoteName(remote.user_name || "Guest");
        setRemoteAvatar(
          remote.userData?.avatar || initialsAvatarDataUrl(remote.user_name || "Guest"),
        );
      }
      setCameraOn(call.localVideo());
      setMicOn(call.localAudio());
      setPhase("in_call");

      const now = Date.now();
      const endMs =
        typeof data.session_end_at === "string"
          ? new Date(data.session_end_at).getTime()
          : now;
      const joinEnd = endMs + 5 * 60 * 1000;
      endTimerRef.current = setTimeout(() => {
        callRef.current?.leave();
        setPhase("ended");
      }, joinEnd - now);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Call failed");
    }
  }, [bookingId]);

  useEffect(() => {
    void startCall();
    return () => {
      clearTimeout(endTimerRef.current);
      callRef.current?.destroy();
    };
  }, [startCall]);

  // Time-remaining ticker.
  useEffect(() => {
    if (phase !== "in_call" || !sessionEndAt) return;
    const tick = () => {
      const remaining = sessionEndAt - Date.now();
      if (remaining <= 0) {
        setTimeLeft("0:00");
        callRef.current?.leave();
        return;
      }
      setTimeLeft(fmtCountdown(sessionEndAt));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [phase, sessionEndAt]);

  const toggleCamera = () => {
    const call = callRef.current;
    if (!call) return;
    const next = !cameraOn;
    call.setLocalVideo(next);
    setCameraOn(next);
  };

  const toggleMic = () => {
    const call = callRef.current;
    if (!call) return;
    const next = !micOn;
    call.setLocalAudio(next);
    setMicOn(next);
  };

  const leave = () => {
    callRef.current?.leave();
    setPhase("ended");
  };

  const backButton = (
    <Button variant="secondary" onClick={() => router.push(`/bookings/${bookingId}`)}>
      Back to booking
    </Button>
  );

  if (phase === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base p-4">
        <div className="text-center">
          <p className="text-lg text-white">{error}</p>
          <div className="mt-4">{backButton}</div>
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base p-4">
        <div className="text-center">
          <p className="text-lg text-white">Session ended</p>
          <div className="mt-4">{backButton}</div>
        </div>
      </div>
    );
  }

  if (phase === "too_early") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base p-4">
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

  if (phase === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base p-4">
        <p className="font-medium text-text-secondary">Making things cozy…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg-base">
      {/* Stage + self-view */}
      <div className="relative flex-1 min-h-0">
        {/* Remote stage tile */}
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          {remoteHasVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              <img
                src={remoteAvatar}
                alt=""
                className="h-28 w-28 rounded-full border-2 border-white/10 object-cover"
              />
              <p className="text-sm text-text-secondary">{remoteName || "Guest"}</p>
            </div>
          )}
          {/* Name tag */}
          <div className="absolute bottom-4 left-4 rounded-pill bg-black/55 px-3 py-1 text-xs text-white">
            {remoteName || "Guest"}
          </div>
        </div>

        {/* Self-view PiP */}
        <div className="absolute top-[calc(12px+env(safe-area-inset-top,0px))] right-3 z-20 h-[86px] w-[140px] overflow-hidden rounded-lg border border-border-subtle bg-card shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
          {cameraOn ? (
            <video
              ref={selfVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <img src={localAvatar} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="absolute bottom-1 left-2 text-[10px] font-medium text-white drop-shadow">
            You
          </div>
        </div>

        {/* Hidden audio element for remote audio */}
        <audio ref={audioRef} autoPlay className="hidden" />

        {/* Tap layer: tap the video to show/hide controls */}
        <button
          type="button"
          aria-label={cleanView ? "Show controls" : "Hide controls"}
          className="absolute inset-0 z-10 cursor-default"
          onClick={() => setCleanView((v) => !v)}
        />
      </div>

      {/* Header */}
      <div
        className={`absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 bg-gradient-to-b from-black/70 to-transparent px-4 pt-[calc(12px+env(safe-area-inset-top,0px))] pb-6 transition-opacity duration-300 ${
          cleanView ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{sessionTitle}</p>
          <p className="text-xs text-text-secondary">
            {sessionEndAt ? `Live · ${timeLeft}` : "Live"}
          </p>
        </div>
        <Button size="small" variant="secondary" onClick={leave}>
          Leave
        </Button>
      </div>

      {/* Control bar */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(20px+env(safe-area-inset-bottom,0px))] transition-opacity duration-300 ${
          cleanView ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div className="flex items-center gap-2.5 rounded-pill border border-border-subtle bg-bg-surface/95 px-4 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
          <button
            type="button"
            onClick={toggleCamera}
            aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              cameraOn ? "bg-bg-card-hover text-white" : "bg-white text-on-primary"
            }`}
          >
            <CameraIcon />
          </button>
          <button
            type="button"
            onClick={toggleMic}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              micOn ? "bg-bg-card-hover text-white" : "bg-white text-on-primary"
            }`}
          >
            <MicIcon />
          </button>
          <button
            type="button"
            onClick={leave}
            aria-label="Leave call"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-on-primary transition-colors hover:bg-bg-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <LeaveIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

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
