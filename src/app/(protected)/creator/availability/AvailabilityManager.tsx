"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAvailability } from "../actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { Pill } from "@/components/ui/Pill";
import { TimeBlocksEditor } from "./TimeBlocksEditor";

// NOTE (v1.1+ consideration): per-offering schedules are explicitly deferred.
// One shared weekly schedule per creator, per haibu-availability-spec.md §1.

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type TimeBlock = { start_minute: number; end_minute: number };
type DayState = { enabled: boolean; blocks: TimeBlock[] };

const DEFAULT_BLOCK: TimeBlock = { start_minute: 9 * 60, end_minute: 17 * 60 };

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AvailabilityManager({
  windows,
  blocks,
  overrides,
  timezone,
}: {
  windows: { day_of_week: number; start_minute: number; end_minute: number }[];
  blocks: { id: string; start_at: string; end_at: string }[];
  overrides: { id: string; date: string; start_minute: number; end_minute: number }[];
  timezone: string;
}) {
  const router = useRouter();
  const [days, setDays] = useState<DayState[]>(() => {
    const initial: DayState[] = Array.from({ length: 7 }, () => ({
      enabled: false,
      blocks: [],
    }));
    for (const w of windows) {
      initial[w.day_of_week] = {
        enabled: true,
        blocks: [...initial[w.day_of_week].blocks, { start_minute: w.start_minute, end_minute: w.end_minute }],
      };
    }
    return initial;
  });
  const [blockRanges, setBlockRanges] = useState<{ start: string; end: string }[]>(() =>
    blocks.map((b) => ({
      start: new Date(b.start_at).toISOString().slice(0, 10),
      end: new Date(b.end_at).toISOString().slice(0, 10),
    })),
  );
  const [overrideMap, setOverrideMap] = useState<Map<string, TimeBlock[]>>(() => {
    const map = new Map<string, TimeBlock[]>();
    for (const o of overrides) {
      const existing = map.get(o.date) ?? [];
      existing.push({ start_minute: o.start_minute, end_minute: o.end_minute });
      map.set(o.date, existing);
    }
    return map;
  });

  // Inline form state
  const [copySource, setCopySource] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set());
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideBlocks, setOverrideBlocks] = useState<TimeBlock[]>([{ ...DEFAULT_BLOCK }]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<{ day: number; message: string } | null>(null);

  const hasAnyWindows = days.some((d) => d.enabled && d.blocks.length > 0);

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  const toggleDay = (dayIndex: number) => {
    setValidationError(null);
    setDays((prev) => {
      const next = prev.map((d) => ({ ...d, blocks: [...d.blocks] }));
      if (next[dayIndex].enabled) {
        next[dayIndex].enabled = false;
        next[dayIndex].blocks = [];
      } else {
        next[dayIndex].enabled = true;
        next[dayIndex].blocks = [{ ...DEFAULT_BLOCK }];
      }
      return next;
    });
  };

  const openCopy = (dayIndex: number) => {
    setCopySource(dayIndex);
    setCopyTargets(new Set());
  };

  const applyCopy = () => {
    if (copySource === null) return;
    setDays((prev) => {
      const next = prev.map((d) => ({ ...d, blocks: [...d.blocks] }));
      const sourceBlocks = next[copySource].blocks;
      for (const target of copyTargets) {
        next[target].enabled = true;
        next[target].blocks = sourceBlocks.map((b) => ({ ...b }));
      }
      return next;
    });
    setCopySource(null);
    setCopyTargets(new Set());
  };

  const applyPreset = (preset: "weekdays" | "evenings" | "weekends") => {
    setDays(() => {
      const next: DayState[] = Array.from({ length: 7 }, () => ({ enabled: false, blocks: [] }));
      if (preset === "weekdays") {
        for (let d = 1; d <= 5; d++) next[d] = { enabled: true, blocks: [{ ...DEFAULT_BLOCK }] };
      } else if (preset === "evenings") {
        for (let d = 0; d < 7; d++) next[d] = { enabled: true, blocks: [{ start_minute: 18 * 60, end_minute: 22 * 60 }] };
      } else {
        next[0] = { enabled: true, blocks: [{ ...DEFAULT_BLOCK }] };
        next[6] = { enabled: true, blocks: [{ ...DEFAULT_BLOCK }] };
      }
      return next;
    });
  };

  const saveBlockRange = () => {
    if (!blockStart || !blockEnd) return;
    if (blockEnd < blockStart) {
      setError("End date must be after start date");
      return;
    }
    setError(null);
    setBlockRanges((prev) => [...prev, { start: blockStart, end: blockEnd }]);
    setBlockStart("");
    setBlockEnd("");
    setShowBlockForm(false);
  };

  const removeBlockRange = (index: number) => {
    setBlockRanges((prev) => prev.filter((_, i) => i !== index));
  };

  const saveOverride = () => {
    if (!overrideDate || overrideBlocks.length === 0) return;
    setError(null);
    setOverrideMap((prev) => {
      const next = new Map(prev);
      next.set(overrideDate, overrideBlocks.map((b) => ({ ...b })));
      return next;
    });
    setOverrideDate("");
    setOverrideBlocks([{ ...DEFAULT_BLOCK }]);
    setShowOverrideForm(false);
  };

  const removeOverride = (date: string) => {
    setOverrideMap((prev) => {
      const next = new Map(prev);
      next.delete(date);
      return next;
    });
  };

  const handleSave = async () => {
    setSaveState("saving");
    setError(null);

    const windows = days.flatMap((d, dayIndex) =>
      d.enabled
        ? d.blocks.map((b) => ({
            day_of_week: dayIndex,
            start_minute: b.start_minute,
            end_minute: b.end_minute,
          }))
        : [],
    );

    // Raw local date strings — the server converts them to full local-day UTC
    // instants using the creator's timezone (blocks are always all-day in v1)
    const blocks = blockRanges.map((t) => ({
      start_at: t.start,
      end_at: t.end,
    }));

    const overrides = Array.from(overrideMap.entries()).flatMap(([date, dateBlocks]) =>
      dateBlocks.map((b) => ({
        date,
        start_minute: b.start_minute,
        end_minute: b.end_minute,
      })),
    );

    const result = await saveAvailability(windows, blocks, overrides);
    if (result && "error" in result) {
      setError((result as { error: string }).error);
      setSaveState("idle");
    } else {
      setSaveState("saved");
      router.refresh();
    }
  };

  // Combined specific-dates list, chronologically sorted
  const blockedBy = (date: string) =>
    blockRanges.find((b) => b.start <= date && date <= b.end) ?? null;
  const blockLabel = (b: { start: string; end: string }) =>
    b.start === b.end ? fmtDate(b.start) : `${fmtDate(b.start)} – ${fmtDate(b.end)}`;

  const combinedList: {
    key: string;
    label: string;
    type: "block" | "override";
    date: string;
    shadowedBy: { start: string; end: string } | null;
  }[] = [
    ...blockRanges.map((b, i) => ({
      key: `block-${i}`,
      label: blockLabel(b),
      type: "block" as const,
      date: b.start,
      shadowedBy: null,
    })),
    ...Array.from(overrideMap.keys()).map((date) => ({
      key: `override-${date}`,
      label: `${fmtDate(date)} · ${overrideMap.get(date)!.map((b) => `${labelFor(b.start_minute)}–${labelFor(b.end_minute)}`).join(", ")}`,
      type: "override" as const,
      date,
      shadowedBy: blockedBy(date),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Inline form warnings: block/override coverage conflicts
  const shadowedOverrideDates =
    blockStart && blockEnd
      ? Array.from(overrideMap.keys()).filter((d) => blockStart <= d && d <= blockEnd)
      : [];
  const overrideShadowedBy =
    overrideDate ? blockedBy(overrideDate) : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary">
        All times below are in <span className="text-white">{timezone}</span>,
        based on your account settings.
      </p>

      {!hasAnyWindows && (
        <Card className="space-y-3">
          <p className="text-sm text-text-secondary">
            Set your weekly hours so fans know when to book you.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="small" variant="secondary" onClick={() => applyPreset("weekdays")}>
              Weekdays, 9–5
            </Button>
            <Button size="small" variant="secondary" onClick={() => applyPreset("evenings")}>
              Evenings, every day
            </Button>
            <Button size="small" variant="secondary" onClick={() => applyPreset("weekends")}>
              Weekends only
            </Button>
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        {days.map((day, dayIndex) => (
          <div key={dayIndex} className="border-b border-border-subtle pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-center gap-3">
              <Switch
                checked={day.enabled}
                onCheckedChange={() => toggleDay(dayIndex)}
                label={DAY_NAMES[dayIndex]}
              />
              <span className={`w-28 text-sm font-medium ${day.enabled ? "text-white" : "text-text-tertiary"}`}>
                {DAY_NAMES[dayIndex]}
              </span>
              {day.enabled && (
                <>
                  {day.blocks.length > 0 && (
                    <Button
                      size="small"
                      variant="ghost"
                      type="button"
                      onClick={() => openCopy(dayIndex)}
                      className="ml-auto"
                    >
                      Copy to…
                    </Button>
                  )}
                </>
              )}
            </div>

            {day.enabled && (
              <div className="mt-2 pl-11">
                <TimeBlocksEditor
                  blocks={day.blocks}
                  onBlocksChange={(blocks) =>
                    setDays((prev) => {
                      const next = prev.map((d) => ({ ...d, blocks: [...d.blocks] }));
                      next[dayIndex].blocks = blocks;
                      if (blocks.length === 0) next[dayIndex].enabled = false;
                      return next;
                    })
                  }
                  onValidationChange={(message) =>
                    setValidationError(message ? { day: dayIndex, message } : null)
                  }
                />
                {validationError && validationError.day === dayIndex && (
                  <p className="mt-1 text-xs text-error">{validationError.message}</p>
                )}
              </div>
            )}

            {copySource === dayIndex && (
              <div className="mt-2 pl-11">
                <div className="inline-block rounded-input bg-bg-surface border border-border-subtle p-3 shadow-xl">
                  <p className="mb-2 text-xs text-text-secondary">
                    Copy {DAY_NAMES[dayIndex]}&apos;s hours to:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {DAY_NAMES.map((name, i) =>
                      i === dayIndex ? null : (
                        <Pill
                          key={i}
                          type="button"
                          variant={copyTargets.has(i) ? "active" : "inactive"}
                          onClick={() =>
                            setCopyTargets((prev) => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            })
                          }
                          className="px-4 py-1.5 text-xs"
                        >
                          {name}
                        </Pill>
                      ),
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="small" onClick={applyCopy}>
                      Apply
                    </Button>
                    <Button
                      size="small"
                      variant="ghost"
                      onClick={() => {
                        setCopySource(null);
                        setCopyTargets(new Set());
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>

      {/* Specific dates */}
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Specific dates</h2>
        <p className="text-sm text-text-secondary">
          Need to change just one day? Use this instead of your weekly schedule
          above.
        </p>

        <div className="flex gap-2">
          <Button size="small" variant="secondary" onClick={() => setShowBlockForm(!showBlockForm)}>
            + Mark unavailable
          </Button>
          <Button size="small" variant="secondary" onClick={() => setShowOverrideForm(!showOverrideForm)}>
            + Add custom hours
          </Button>
        </div>

        {showBlockForm && (
          <div className="rounded-input bg-bg-base p-3 space-y-3">
            <div className="flex gap-2">
              <Input
                type="date"
                value={blockStart}
                onChange={(e) => setBlockStart(e.target.value)}
                className="[color-scheme:dark]"
                aria-label="Block start date"
              />
              <span className="self-center text-text-secondary">to</span>
              <Input
                type="date"
                value={blockEnd}
                onChange={(e) => setBlockEnd(e.target.value)}
                className="[color-scheme:dark]"
                aria-label="Block end date"
              />
            </div>
            {shadowedOverrideDates.length > 0 && (
              <p className="text-xs text-amber-400">
                This range covers {shadowedOverrideDates.length} custom-hours{" "}
                {shadowedOverrideDates.length === 1 ? "date" : "dates"} (
                {shadowedOverrideDates.slice(0, 2).map((d) => fmtDate(d)).join(", ")}
                {shadowedOverrideDates.length > 2 ? ", …" : ""}) — those overrides will
                have no effect while this block is active.
              </p>
            )}
            <div className="flex gap-2">
              <Button size="small" onClick={saveBlockRange}>
                Save
              </Button>
              <Button size="small" variant="ghost" onClick={() => setShowBlockForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {showOverrideForm && (
          <div className="rounded-input bg-bg-base p-3 space-y-3">
            <Input
              type="date"
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value)}
              className="[color-scheme:dark]"
              aria-label="Custom hours date"
            />
            {overrideShadowedBy && (
              <p className="text-xs text-amber-400">
                This date is already marked unavailable (block on{" "}
                {blockLabel(overrideShadowedBy)}), so custom hours won't apply unless
                you remove the block.
              </p>
            )}
            <TimeBlocksEditor
              blocks={overrideBlocks}
              onBlocksChange={setOverrideBlocks}
            />
            <div className="flex gap-2">
              <Button size="small" onClick={saveOverride}>
                Save
              </Button>
              <Button size="small" variant="ghost" onClick={() => setShowOverrideForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {combinedList.length > 0 && (
          <div className="space-y-2">
            {combinedList.map((entry) => (
              <div key={entry.key} className="rounded-input bg-bg-base px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm ${entry.shadowedBy ? "text-text-tertiary" : "text-white"}`}
                    >
                      {entry.label}
                    </span>
                    {entry.type === "block" ? (
                      <Badge variant="cancelled" label="Unavailable" />
                    ) : (
                      <Badge variant="pending" label="Custom hours" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      entry.type === "block"
                        ? removeBlockRange(Number(entry.key.split("-")[1]))
                        : removeOverride(entry.date)
                    }
                    className="text-text-tertiary hover:text-error transition-colors"
                    aria-label="Remove entry"
                  >
                    ×
                  </button>
                </div>
                {entry.shadowedBy && (
                  <p className="mt-1 text-xs text-text-tertiary">
                    Overridden by your block on {blockLabel(entry.shadowedBy)} — has no effect
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-error">{error}</p>}

      <Button onClick={handleSave} disabled={saveState !== "idle"}>
        {saveState === "saving"
          ? "Saving..."
          : saveState === "saved"
            ? "Saved ✓"
            : "Save availability"}
      </Button>
    </div>
  );
}

function labelFor(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? "AM" : "PM";
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
