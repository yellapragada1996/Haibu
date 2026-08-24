"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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

function nudgeObjectFit(v: HTMLVideoElement) {
  v.style.objectFit = "none";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      v.style.objectFit = "";
    });
  });
}

function isIOSNonSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) ||
                (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  if (!isIOS) return false;
  return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function addTrackTo(el: HTMLVideoElement | HTMLAudioElement | null, track: MediaStreamTrack) {
  if (!el) return;
  const existing = el.srcObject as MediaStream | null;

  // iOS Chrome (WKWebView): reassigning srcObject with a fresh MediaStream
  // resets the internal decoder, which fixes black-frame rendering bugs.
  if (isIOSNonSafari() && existing) {
    const fresh = new MediaStream([...existing.getTracks(), track]);
    el.srcObject = fresh;
  } else {
    const stream = existing ?? new MediaStream();
    if (stream.getTracks().includes(track)) return;
    stream.addTrack(track);
    el.srcObject = stream;
  }

  // iOS Chrome (WKWebView) can silently refuse play() outside a user gesture.
  // Retry on the next user interaction if the initial attempt fails.
  el.play().catch(() => {
    const resume = () => {
      el.play().catch(() => {});
      document.removeEventListener("touchstart", resume);
      document.removeEventListener("click", resume);
    };
    document.addEventListener("touchstart", resume, { once: true });
    document.addEventListener("click", resume, { once: true });
  });

  if (el instanceof HTMLVideoElement) {
    el.addEventListener("playing", () => nudgeObjectFit(el), { once: true });
  }
}

function removeTrackFrom(el: HTMLVideoElement | HTMLAudioElement | null, track: MediaStreamTrack) {
  if (!el) return;
  const stream = el.srcObject as MediaStream | undefined;
  if (!stream) return;
  stream.removeTrack(track);
  if (stream.getTracks().length === 0) el.srcObject = null;
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
  const [swapped, setSwapped] = useState(false);
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
  const [cameraFailed, setCameraFailed] = useState<false | true | string>(false);
  const [endedByTimer, setEndedByTimer] = useState(false);
  const [remoteLeftName, setRemoteLeftName] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const callRef = useRef<DailyCall | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reset the "auto-hide the control tray" timer — called on any interaction.
  const resetAutoHide = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setCleanView(true), 4000);
  }, []);
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
        await callRef.current.destroy();
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
          setRemoteLeftName(null);
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
          setRemoteLeftName(p.participant.user_name || "The other person");
          setHasRemote(false);
          setRemoteHasVideo(false);
          setRemoteName("");
          setRemoteAvatar("");
          setSwapped(false);
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
        setEndedByTimer(false);
        setPhase("ended");
      });

      call.on("error", (e) => {
        const err = e as { errorMsg?: string };
        setError(err.errorMsg ?? "Call error");
      });

      call.on("camera-error", () => {
        setCameraFailed(true);
      });

      // flushSync guarantees React commits the "in_call" render (creating the
      // <video> elements and populating refs) before call.join() fires
      // track-started — without it the local video track is silently dropped.
      flushSync(() => setPhase("in_call"));

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
      if (!call.localVideo()) setCameraFailed(true);

      const now = Date.now();
      const endMs =
        typeof data.session_end_at === "string"
          ? new Date(data.session_end_at).getTime()
          : now;
      const joinEnd = endMs + 5 * 60 * 1000;
      endTimerRef.current = setTimeout(() => {
        callRef.current?.leave();
        setEndedByTimer(true);
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

  // Auto-hide the control tray after a few seconds of inactivity.
  useEffect(() => {
    if (phase === "in_call") resetAutoHide();
    return () => clearTimeout(hideTimerRef.current);
  }, [phase, resetAutoHide]);

  // Desktop fullscreen state.
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const retryCameraAccess = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraFailed("getUserMedia not available");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      await call.setInputDevicesAsync({
        ...(videoTrack ? { videoSource: videoTrack } : {}),
        ...(audioTrack ? { audioSource: audioTrack } : {}),
      });
      setCameraFailed(false);
      setCameraOn(true);
      setMicOn(true);
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      const msg = e instanceof Error ? e.message : String(e);
      if (name === "NotAllowedError") {
        setCameraFailed("Permission denied. In Chrome, tap the lock icon in the address bar → Site settings → Camera → Allow");
      } else {
        setCameraFailed(`${name}: ${msg}`);
      }
    }
  }, []);

  const toggleCamera = () => {
    const call = callRef.current;
    if (!call) return;
    const next = !cameraOn;
    call.setLocalVideo(next);
    setCameraOn(next);
    resetAutoHide();
  };

  const toggleMic = () => {
    const call = callRef.current;
    if (!call) return;
    const next = !micOn;
    call.setLocalAudio(next);
    setMicOn(next);
    resetAutoHide();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      rootRef.current?.requestFullscreen().catch(() => {});
    }
    resetAutoHide();
  };

  const toggleSwap = () => {
    if (hasRemote) setSwapped((v) => !v);
    resetAutoHide();
  };

  const sendChat = () => {
    const call = callRef.current;
    const text = draft.trim();
    if (!call || !text) return;
    call.sendAppMessage({ message: text });
    setMessages((m) => [...m, { from: "me", text }]);
    setDraft("");
  };

  const toggleChat = () => {
    if (chatOpen) {
      setChatOpen(false);
    } else {
      setChatOpen(true);
      setHasUnread(false);
      setPeopleOpen(false);
    }
    resetAutoHide();
  };

  const togglePeople = () => {
    if (peopleOpen) {
      setPeopleOpen(false);
    } else {
      setPeopleOpen(true);
      setChatOpen(false);
    }
    resetAutoHide();
  };

  const leave = () => {
    callRef.current?.leave();
    setEndedByTimer(false);
    setPhase("ended");
  };

  const rejoin = () => {
    startedRef.current = false;
    setPhase("loading");
    void startCall();
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
    const otherName = remoteName || remoteLeftName || "the other person";
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base p-4">
        <div className="w-full max-w-xs text-center">
          {endedByTimer && (
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-live/40 bg-live/10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
          )}
          <h1 className="text-xl font-bold text-white">
            {endedByTimer ? "Session complete" : "You left the call"}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {endedByTimer
              ? `Your session with ${otherName} is over.`
              : `Your session with ${otherName} is still running — you can rejoin.`}
          </p>
          {!endedByTimer && (
            <Button className="mt-6 w-full" onClick={rejoin}>
              Rejoin
            </Button>
          )}
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => router.push(`/bookings/${bookingId}`)}
          >
            Back to booking
          </Button>
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

  // Tile placement: tapping the PiP swaps which participant is the full-bleed
  // stage vs the small picture-in-picture tile.
  const remoteIsStage = hasRemote && !swapped;
  const localIsStage = !hasRemote || swapped;
  const localIsPip = hasRemote && !swapped && showSelfView;
  const remoteIsPip = hasRemote && swapped;

  const stageClass = "absolute inset-0 bg-black";
  const pipClass = isDesktop
    ? "absolute top-4 right-4 z-20 h-[178px] w-[100px] overflow-hidden rounded-lg border border-border-subtle bg-bg-card shadow-[0_8px_24px_rgba(0,0,0,0.55)] cursor-pointer"
    : "absolute top-[calc(12px+env(safe-area-inset-top,0px))] right-3 z-20 h-[140px] w-[86px] overflow-hidden rounded-lg border border-border-subtle bg-bg-card shadow-[0_8px_24px_rgba(0,0,0,0.55)] cursor-pointer";

  const remoteClass = !hasRemote ? "hidden" : remoteIsStage ? stageClass : remoteIsPip ? pipClass : "hidden";
  const localClass = localIsStage ? stageClass : localIsPip ? pipClass : "hidden";

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
          className="min-w-0 flex-1 rounded-pill border border-border-subtle bg-bg-card px-4 py-2.5 text-base text-white placeholder:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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

  const peopleBody = (
    <>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-text-secondary">People</p>
        <button
          type="button"
          onClick={() => setPeopleOpen(false)}
          aria-label="Close people"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-2 pt-2">
        <div className="flex items-center gap-3">
          <img src={localAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
          <div>
            <p className="text-sm font-semibold text-white">You</p>
            <p className="text-xs text-text-secondary">In call</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <img
            src={remoteAvatar || initialsAvatarDataUrl(remoteName || remoteLeftName || "Guest")}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
          <div>
            <p className="text-sm font-semibold text-white">
              {remoteName || remoteLeftName || "The other person"}
            </p>
            <p className="text-xs text-text-secondary">
              {hasRemote ? "In call" : remoteLeftName ? "Left" : "Not joined yet"}
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div ref={rootRef} className="flex h-dvh flex-col overflow-hidden bg-bg-base">
      {/* Stage + self-view */}
      <div className="relative flex-1 min-h-0">
        {/* Remote participant — stage or PiP depending on swap */}
        <div className={remoteClass} onClick={toggleSwap}>
          <video ref={remoteVideoRef} autoPlay playsInline muted className={`h-full w-full ${remoteIsStage ? "object-contain" : "object-cover"}`} />
          {!remoteHasVideo && (
            remoteIsStage ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <img src={remoteAvatar} alt="" className="h-28 w-28 rounded-full border-2 border-white/10 object-cover" />
                <p className="text-sm text-text-secondary">{remoteName || "Guest"}</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <img src={remoteAvatar} alt="" className="h-12 w-12 rounded-full border-2 border-white/10 object-cover" />
              </div>
            )
          )}
          {remoteIsStage && (
            <div className="absolute bottom-4 left-4 rounded-pill bg-black/55 px-3 py-1 text-xs text-white">
              {remoteName || "Guest"}
            </div>
          )}
        </div>

        {/* Local participant — stage or PiP depending on swap */}
        <div className={localClass} onClick={toggleSwap}>
          <video ref={selfVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
          {!cameraOn && (
            localIsStage ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <img src={localAvatar} alt="" className="h-28 w-28 rounded-full border-2 border-white/10 object-cover" />
                <p className="text-sm text-text-secondary">You</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <img src={localAvatar} alt="" className="h-12 w-12 rounded-full border-2 border-white/10 object-cover" />
              </div>
            )
          )}
          {localIsPip && (
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
          onClick={() => {
            // Tapping outside an open drawer dismisses it (standard bottom-sheet
            // behavior); otherwise the tap toggles the auto-hiding controls.
            if (chatOpen) setChatOpen(false);
            else if (peopleOpen) setPeopleOpen(false);
            else {
              setCleanView(false);
              resetAutoHide();
            }
          }}
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

      {/* Other participant left */}
      {remoteLeftName && !hasRemote && (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 whitespace-nowrap rounded-pill border border-border-subtle bg-bg-surface/90 px-4 py-2 text-sm font-semibold text-white">
          {remoteLeftName} left the session
        </div>
      )}

      {cameraFailed && (
        typeof cameraFailed === "string" ? (
          <div className="absolute left-1/2 top-20 z-50 -translate-x-1/2 max-w-[min(90vw,320px)] rounded-2xl border border-border-subtle bg-bg-surface/95 px-5 py-3 text-center shadow-lg">
            <p className="text-sm font-semibold text-white">{cameraFailed}</p>
            <p className="mt-2 text-xs text-text-secondary">Or open this page in Safari</p>
            <button type="button" onClick={retryCameraAccess} className="mt-2 text-xs font-semibold text-brand">
              Try again
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={retryCameraAccess}
            className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-pill border border-border-subtle bg-bg-surface/95 px-5 py-3 text-sm font-semibold text-white shadow-lg active:bg-bg-card-hover"
          >
            Tap to enable camera
          </button>
        )
      )}

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
            onClick={toggleChat}
            aria-label={hasUnread ? "Open chat (new message)" : "Open chat"}
            className="relative flex h-11 w-11 items-center justify-center rounded-full bg-bg-card-hover text-white transition-colors hover:bg-bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ChatIcon />
            {hasUnread && !chatOpen && (
              <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-bg-surface" />
            )}
          </button>
          <button
            type="button"
            onClick={togglePeople}
            aria-label={peopleOpen ? "Close people" : "Open people"}
            className="relative flex h-11 w-11 items-center justify-center rounded-full bg-bg-card-hover text-white transition-colors hover:bg-bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <PeopleIcon />
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
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <LeaveIcon />
          </button>
        </div>
      </div>

      {/* Chat: side panel on desktop, bottom sheet on mobile */}
      {chatOpen && (
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

      {/* People: side panel on desktop, bottom sheet on mobile */}
      {peopleOpen && (
        isDesktop ? (
          <div className="absolute bottom-0 right-0 top-0 z-40 flex w-[320px] flex-col border-l border-border-subtle bg-bg-surface px-4 py-4">
            {peopleBody}
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 z-40 flex h-[55%] flex-col rounded-t-2xl border-t border-border-subtle bg-bg-surface px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3">
            {peopleBody}
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

function PeopleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
