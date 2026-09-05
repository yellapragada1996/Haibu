"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { groupSlotsByTimeOfDay, type TimeOfDayGroup } from "@/lib/slot-groups";

interface Slot {
  start_at: string;
  end_at: string;
}

const GROUP_LABELS: Record<TimeOfDayGroup, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

// Screen 2 — public slot picker. No login required. "Continue" checks the
// session: logged-in → the protected book page (payment); anonymous → login
// with a redirect back (booking intent preserved in the redirect + sessionStorage).
export function SlotPicker({
  creator,
  offering,
  slots,
}: {
  creator: { id: string; display_name: string; avatar_url: string | null };
  offering: {
    id: string;
    title: string;
    duration_minutes: number;
    price_cents: number;
  };
  slots: Slot[];
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzAbbr = useMemo(() => {
    try {
      return (
        new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
          .formatToParts(new Date())
          .find((p) => p.type === "timeZoneName")?.value ?? tz
      );
    } catch {
      return tz;
    }
  }, [tz]);

  // Local date key (YYYY-MM-DD in the guest's timezone) so slots group correctly.
  const localDateKey = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA");

  const datePills = useMemo(() => {
    const keys: string[] = [];
    for (const s of slots) {
      const k = localDateKey(s.start_at);
      if (!keys.includes(k)) keys.push(k);
    }
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const fmtDate = (key: string) =>
    new Date(key + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

  const slotsForDate = selectedDate
    ? slots.filter((s) => localDateKey(s.start_at) === selectedDate)
    : [];

  const groupedSlots = useMemo(
    () => groupSlotsByTimeOfDay(slotsForDate),
    [slotsForDate],
  );

  // Default to TODAY when the creator has slots today; otherwise the first
  // available day — so the time grid is never empty on arrival.
  useEffect(() => {
    if (slots.length === 0 || selectedDate) return;
    const todayKey = new Date().toLocaleDateString("en-CA");
    if (datePills.includes(todayKey)) setSelectedDate(todayKey);
    else setSelectedDate(datePills[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const continueFlow = async () => {
    if (!selectedSlot) return;
    const bookUrl = `/book/${creator.id}?offering=${offering.id}&slot=${encodeURIComponent(selectedSlot)}`;
    try {
      sessionStorage.setItem(
        "pendingBooking",
        JSON.stringify({
          creatorId: creator.id,
          creatorName: creator.display_name,
          avatarUrl: creator.avatar_url,
          offeringId: offering.id,
          offeringTitle: offering.title,
          durationMinutes: offering.duration_minutes,
          slotStart: selectedSlot,
          priceCents: offering.price_cents,
          displayDate: selectedDate ? fmtDate(selectedDate) : "",
          displayTime: fmtTime(selectedSlot),
        }),
      );
    } catch {
      /* storage unavailable */
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) router.push(bookUrl);
    else router.push(`/login?redirect=${encodeURIComponent(bookUrl)}`);
  };

  return (
    <div className="pb-36 md:pb-24">
      {/* Offering context bar */}
      <div className="mb-4 flex items-center gap-2 rounded-card border border-border-subtle bg-bg-card px-3 py-2">
        {creator.avatar_url ? (
          <img
            src={creator.avatar_url}
            alt=""
            className="h-7 w-7 rounded-full object-cover"
          />
        ) : (
          <div className="h-7 w-7 rounded-full bg-bg-card-hover" />
        )}
        <span className="text-sm font-semibold text-text-primary">
          {creator.display_name}
        </span>
        <span className="text-xs text-text-secondary">
          · {offering.title} · {offering.duration_minutes} min
        </span>
      </div>

      <h1 className="mb-3 text-lg font-semibold text-text-primary">Pick a time</h1>

      {slots.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No available slots in the next 30 days.
        </p>
      ) : (
        <>
          {/* Date pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Pick a day">
            {datePills.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedDate(key);
                  setSelectedSlot(null);
                }}
                aria-pressed={selectedDate === key}
                className={`inline-flex h-9 shrink-0 items-center rounded-pill px-4 text-xs font-medium transition-colors ${
                  selectedDate === key
                    ? "bg-primary font-semibold text-on-primary"
                    : "bg-bg-card-hover text-text-secondary hover:text-text-primary"
                }`}
              >
                {fmtDate(key)}
              </button>
            ))}
          </div>

          {/* Grouped time slots */}
          <div className="mt-4 space-y-5">
            {groupedSlots.map(({ group, slots: groupSlots }) => (
              <section key={group}>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    {GROUP_LABELS[group]}
                  </span>
                  <div className="h-px flex-1 bg-border-subtle" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {groupSlots.map((s) => (
                    <button
                      key={s.start_at}
                      type="button"
                      onClick={() => setSelectedSlot(s.start_at)}
                      aria-pressed={selectedSlot === s.start_at}
                      aria-label={`${selectedDate ? fmtDate(selectedDate) : ""} ${fmtTime(s.start_at)}`}
                      className={`flex min-h-[44px] items-center justify-center rounded-[10px] text-[13px] font-semibold transition-colors ${
                        selectedSlot === s.start_at
                          ? "bg-primary text-on-primary"
                          : "bg-bg-card text-text-primary hover:bg-bg-card-hover"
                      }`}
                    >
                      {fmtTime(s.start_at)}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {slotsForDate.length === 0 && (
              <p className="text-sm text-text-secondary">
                No times on this day.
              </p>
            )}
          </div>

          {/* Timezone note */}
          <p className="mt-3 text-xs text-text-secondary">
            Times shown in your timezone ({tzAbbr})
          </p>

          {/* Sticky summary footer — sits above the mobile BottomNav (z-40, h-16) */}
          <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border-subtle bg-bg-base px-4 py-3 md:bottom-0">
            <div className="mx-auto flex max-w-[480px] items-center justify-between">
              <div>
                <div className="text-xs text-text-secondary">
                  {selectedDate && selectedSlot
                    ? `${fmtDate(selectedDate)} · ${fmtTime(selectedSlot)}`
                    : "Pick a time"}
                </div>
                <div className="text-sm font-bold text-text-primary">
                  ${(offering.price_cents / 100).toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                onClick={continueFlow}
                disabled={!selectedSlot}
                className="inline-flex h-11 items-center justify-center rounded-pill bg-primary px-6 text-sm font-semibold text-on-primary transition-opacity disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
