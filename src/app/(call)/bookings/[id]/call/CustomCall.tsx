"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { initialsAvatarDataUrl } from "@/lib/daily-ui";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { DailyCall, DailyParticipant } from "@/lib/daily-types";

// ---------------------------------------------------------------------------
// Custom call UI (call-object mode) — media-first, responsive.
// Creator full-bleed, dismissible self-view, chat (non-interrupting
// notification), tap-to-focus. Desktop adds a real fullscreen button and a
// side chat panel; mobile uses a bottom chat sheet. No Daily Prebuilt iframe.
// ---------------------------------------------------------------------------

type Phase = "loading" | "too_early" | "in_call" | "ended" | "error";

interface TrackEvent {
  participant?: DailyParticipant | null;
  track: MediaStreamTrack;
  type: string;
}

interface ChatMessage {
  from: "me" | "them";
  text: string;
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

export function CustomCall({ bookingId }: { bookingId: string }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [phase, setPhase] = useState<Phase>("loading");
  const [countdown, setCountdown] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionEndAt, setSessionEndAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [showSelfView, setShowSelfView] = useState(true);
  const [hasRemote, setHasRemote] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [remoteName, setRemoteName] = useState("");
  const [remoteAvatar, setRemoteAvatar] = useState("");
  const [localAvatar, setLocalAvatar] = useState("");
  const [cleanView, setCleanView] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState("");

  const callRef = useRef<DailyCall | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startedRef = useRef(false);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

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
          setHasRemote(true);
          setRemoteName(p.participant.user_name || "Guest");
          setRemoteAvatar(
            p.participant.userData?.avatar || initialsAvatarDataUrl(p.participant.user_name || "Guest"),
          );
        }
      });

      call.on("participant-updated", (e) => {
        const p = e as { participant?: DailyParticipant };
        if (p.participant && !p.participant.local) {
          setRemoteName(p.participant.user_name || "Guest");
        }
      });

      call.on("participant-left", (e) => {
        const p = e as { participant?: DailyParticipant };
        if (p.participant && !p.participant.local) {
          setHasRemote(false);
          setRemoteHasVideo(false);
          setRemoteName("");
          setRemoteAvatar("");
        }
      });

      call.on("app-message", (e) => {
        const ev = e as { data?: { message?: string } };
        const text = ev.data?.message;
        if (typeof text === "string" && text.trim()) {
          setMessages((m) => [...m, { from: "them", text: text.trim() }]);
          setHasUnread(true);
        }
      });

      call.on("left-meeting", () => {
        setPhase("ended");
      });

      call.on("error", (e) => {
        const err = e as { errorMsg?: string };
        setError(err.errorMsg ?? "Call error");
      });

      // Render the tiles BEFORE joining so the <video> refs exist when
      // track-started fires (otherwise the remote/local tracks are dropped).
      setPhase("in_call");

      await call.join();

      const participants = call.participants();
      const remote = Object.values(participants).find((p) => !p.local);
      if (remote) {
        setHasRemote(true);
        setRemoteName(remote.user_name || "Guest");
        setRemoteAvatar(
          remote.userData?.avatar || initialsAvatarDataUrl(remote.user_name || "Guest"),
        );
      }
      setCameraOn(call.localVideo());
      setMicOn(call.localAudio());

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

  // Desktop fullscreen state.
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

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

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      rootRef.current?.requestFullscreen().catch(() => {});
    }
  };

  const sendChat = () => {
    const call = callRef.current;
    const text = draft.trim();
    if (!call || !text) return;
    call.sendAppMessage({ message: text });
    setMessages((m) => [...m, { from: "me", text }]);
    setDraft("");
  };

  const openChat = () => {
    setChatOpen(true);
    setHasUnread(false);
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

  const pipVisible = hasRemote && showSelfView && !cleanView;

  const chatBody = (
    <>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-text-secondary">Chat</p>
        <button
          type="button"
          onClick={() => setChatOpen(false)}
          aria-label="Close chat"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <p className="mt-4 text-center text-xs text-text-secondary">No messages yet</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm leading-relaxed ${m.from === "me" ? "self-end bg-brand text-white" : "self-start bg-bg-card-hover text-white"}`}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          ref={chatInputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendChat(); } }}
          placeholder="Message…"
          aria-label="Chat message"
          className="min-w-0 flex-1 rounded-pill border border-border-subtle bg-bg-card px-4 py-2.5 text-sm text-white placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <button
          type="button"
          onClick={sendChat}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <SendIcon />
        </button>
      </div>
    </>
  );

  return (
    <div ref={rootRef} className="flex h-dvh flex-col overflow-hidden bg-bg-base">
      {/* Stage + self-view */}
      <div className="relative flex-1 min-h-0">
        {/* Remote participant: full-bleed stage when present */}
        <div className={`absolute inset-0 bg-black ${hasRemote ? "" : "hidden"}`}>
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-contain" />
          {!remoteHasVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <img src={remoteAvatar} alt="" className="h-28 w-28 rounded-full border-2 border-white/10 object-cover" />
              <p className="text-sm text-text-secondary">{remoteName || "Guest"}</p>
            </div>
          )}
          <div className="absolute bottom-4 left-4 rounded-pill bg-black/55 px-3 py-1 text-xs text-white">
            {remoteName || "Guest"}
          </div>
        </div>

        {/* Local video: full-bleed stage when solo, PiP when a remote is present */}
        <div
          className={`${hasRemote
            ? isDesktop
              ? "absolute top-4 right-4 z-20 h-[100px] w-[178px] overflow-hidden rounded-lg border border-border-subtle bg-card shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
              : "absolute top-[calc(12px+env(safe-area-inset-top,0px))] right-3 z-20 h-[86px] w-[140px] overflow-hidden rounded-lg border border-border-subtle bg-card shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
            : "absolute inset-0 bg-black"} ${hasRemote && !pipVisible ? "hidden" : ""}`}
        >
          <video ref={selfVideoRef} autoPlay playsInline muted className={`h-full w-full ${hasRemote ? "object-cover" : "object-contain"}`} />
          {!cameraOn && (
            hasRemote ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <img src={localAvatar} alt="" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <img src={localAvatar} alt="" className="h-28 w-28 rounded-full border-2 border-white/10 object-cover" />
                <p className="text-sm text-text-secondary">You</p>
              </div>
            )
          )}
          {hasRemote && (
            <div className="absolute bottom-1 left-2 text-[10px] font-medium text-white drop-shadow">You</div>
          )}
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
        className={`absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 bg-gradient-to-b from-black/70 to-transparent px-4 pt-[calc(12px+env(safe-area-inset-top,0px))] pb-6 transition-opacity duration-300 ${cleanView ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{sessionTitle}</p>
          <p className="text-xs text-text-secondary">{sessionEndAt ? `Live · ${timeLeft}` : "Live"}</p>
        </div>
      </div>

      {/* Control bar */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(20px+env(safe-area-inset-bottom,0px))] transition-opacity duration-300 ${cleanView ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <div className="flex items-center gap-2.5 rounded-pill border border-border-subtle bg-bg-surface/95 px-4 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
          <ControlButton on={micOn} onClick={toggleMic} label={micOn ? "Mute microphone" : "Unmute microphone"}>
            <MicIcon />
          </ControlButton>
          <ControlButton on={cameraOn} onClick={toggleCamera} label={cameraOn ? "Turn camera off" : "Turn camera on"}>
            <CameraIcon />
          </ControlButton>
          <ControlButton on={showSelfView} onClick={() => setShowSelfView((v) => !v)} label={showSelfView ? "Hide self-view" : "Show self-view"}>
            <EyeIcon />
          </ControlButton>
          <button
            type="button"
            onClick={openChat}
            aria-label={hasUnread ? "Open chat (new message)" : "Open chat"}
            className="relative flex h-11 w-11 items-center justify-center rounded-full bg-bg-card-hover text-white transition-colors hover:bg-bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ChatIcon />
            {hasUnread && !chatOpen && (
              <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-bg-surface" />
            )}
          </button>
          {isDesktop && (
            <ControlButton on={isFullscreen} onClick={toggleFullscreen} label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              <FullscreenIcon />
            </ControlButton>
          )}
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

      {/* Chat: side panel on desktop, bottom sheet on mobile */}
      {chatOpen && !cleanView && (
        isDesktop ? (
          <div className="absolute bottom-0 right-0 top-0 z-40 flex w-[320px] flex-col border-l border-border-subtle bg-bg-surface px-4 py-4">
            {chatBody}
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 z-40 flex h-[55%] flex-col rounded-t-2xl border-t border-border-subtle bg-bg-surface px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3">
            {chatBody}
          </div>
        )
      )}
    </div>
  );
}

function ControlButton({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${on ? "bg-bg-card-hover text-white" : "bg-white text-on-primary"}`}
    >
      {children}
    </button>
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

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
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

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
