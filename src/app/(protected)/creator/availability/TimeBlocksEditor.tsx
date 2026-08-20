"use client";

// Shared time-block editor: start/end pickers in 30-minute increments,
// per-block remove, "+ Add another block". Used by both the weekly grid and
// the "Open custom hours" form — do not duplicate.

export type TimeBlock = { start_minute: number; end_minute: number };

const DEFAULT_BLOCK: TimeBlock = { start_minute: 9 * 60, end_minute: 17 * 60 };

function minuteOptions() {
  const opts: { value: number; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? "AM" : "PM";
    opts.push({ value: m, label: `${h12}:${min.toString().padStart(2, "0")} ${ampm}` });
  }
  return opts;
}
const MINUTE_OPTIONS = minuteOptions();

export function TimeBlocksEditor({
  blocks,
  onBlocksChange,
  onValidationChange,
}: {
  blocks: TimeBlock[];
  onBlocksChange: (blocks: TimeBlock[]) => void;
  onValidationChange?: (message: string | null) => void;
}) {
  const updateBlock = (index: number, field: "start_minute" | "end_minute", value: number) => {
    const next = blocks.map((b) => ({ ...b }));
    next[index][field] = value;

    const block = next[index];
    if (block.end_minute <= block.start_minute) {
      onValidationChange?.("End time must be after start time");
    } else {
      const others = next.filter((_, i) => i !== index);
      const overlaps = others.some(
        (o) => block.start_minute < o.end_minute && block.end_minute > o.start_minute,
      );
      onValidationChange?.(overlaps ? "Time blocks can't overlap" : null);
    }
    onBlocksChange(next);
  };

  const addBlock = () => {
    const lastEnd = blocks.length > 0 ? blocks[blocks.length - 1].end_minute : 17 * 60;
    let start = lastEnd + 60;
    if (start > 21 * 60) start = 18 * 60;
    onBlocksChange([
      ...blocks,
      { start_minute: start, end_minute: Math.min(start + 2 * 60, 23 * 60 + 30) },
    ]);
  };

  const removeBlock = (index: number) => {
    onBlocksChange(blocks.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            value={block.start_minute}
            onChange={(e) => updateBlock(index, "start_minute", Number(e.target.value))}
            className="min-w-0 flex-1 bg-bg-base border border-border-subtle rounded-input pl-2 pr-6 py-1.5 text-sm text-white outline-none focus:border-primary"
          >
            {MINUTE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-text-secondary">–</span>
          <select
            value={block.end_minute}
            onChange={(e) => updateBlock(index, "end_minute", Number(e.target.value))}
            className="min-w-0 flex-1 bg-bg-base border border-border-subtle rounded-input pl-2 pr-6 py-1.5 text-sm text-white outline-none focus:border-primary"
          >
            {MINUTE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => removeBlock(index)}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-text-tertiary transition-colors hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Remove time block"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addBlock}
        className="text-xs text-text-secondary hover:text-white transition-colors"
      >
        + Add another block
      </button>
    </div>
  );
}
