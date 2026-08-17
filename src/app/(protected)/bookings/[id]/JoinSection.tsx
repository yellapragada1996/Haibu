"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function JoinSection({
  bookingId,
  startAt,
  endAt,
}: {
  bookingId: string;
  startAt: string;
  endAt: string;
}) {
  const router = useRouter();
  // Start null so the server render and the client's first render agree;
  // the live clock starts client-side only, after mount.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const joinStart = new Date(startAt).getTime() - 5 * 60 * 1000;
  const joinEnd = new Date(endAt).getTime() + 5 * 60 * 1000;

  let state: "waiting" | "open" | "closed" = "waiting";
  if (now !== null) {
    if (now >= joinEnd) state = "closed";
    else if (now >= joinStart) state = "open";
  }

  return (
    <div className="mt-4 rounded-input bg-bg-card-hover p-4">
      {state === "waiting" && (
        <>
          <p className="text-sm text-text-secondary">
            Join available in{" "}
            <span className="font-mono text-white">
              {now === null ? "--:--" : fmtCountdown(joinStart - now)}
            </span>
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            The join link unlocks 5 minutes before your session starts.
          </p>
        </>
      )}
      {state === "open" && (
        <p className="text-sm font-medium text-live">
          Your session is live — join now.
        </p>
      )}
      {state === "closed" && (
        <p className="text-sm text-text-secondary">The join window has closed.</p>
      )}
      <Button
        className="mt-3 w-full"
        disabled={state !== "open"}
        onClick={() => router.push(`/bookings/${bookingId}/call`)}
      >
        {state === "closed" ? "Session ended" : "Join session"}
      </Button>
    </div>
  );
}
