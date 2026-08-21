"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { createOfferings } from "./actions";
import { Input, Select } from "@/components/ui/Input";

type Draft = {
  title: string;
  category: string;
  duration_minutes: number;
  price_dollars: string;
};

const DURATIONS = [5, 15, 30, 45, 60];

export type WizardOfferingStepHandle = {
  submit: () => Promise<void>;
};

export const WizardOfferingStep = forwardRef<
  WizardOfferingStepHandle,
  {
    existing: {
      id: string;
      title: string;
      category: string;
      duration_minutes: number;
      price_cents: number;
    }[];
    categories: { value: string; label: string }[];
    profileCategory: string;
    onSaved: () => void;
  }
>(function WizardOfferingStep(
  { existing, categories, profileCategory, onSaved },
  ref,
) {
  const emptyDraft = (): Draft => ({
    title: "",
    category: profileCategory,
    duration_minutes: 30,
    price_dollars: "",
  });

  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categoryLabel = (value: string) =>
    categories.find((c) => c.value === value)?.label ?? value;

  const submit = async () => {
    const filled = drafts.filter((d) => d.title.trim().length > 0);
    if (filled.length === 0) {
      onSaved();
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createOfferings(
      filled.map((d) => ({
        title: d.title,
        category: d.category,
        duration_minutes: d.duration_minutes,
        price_dollars: parseFloat(d.price_dollars),
      })),
    );
    setSaving(false);
    if (result && "error" in result) {
      setError(result.error);
    } else {
      onSaved();
    }
  };

  // Keep a stable imperative handle that always calls the latest submit.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useImperativeHandle(ref, () => ({ submit: () => submitRef.current() }), []);

  const updateDraft = (index: number, patch: Partial<Draft>) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  };

  const removeDraft = (index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const addDraft = () => {
    setDrafts((prev) => [...prev, emptyDraft()]);
  };

  return (
    <div className="space-y-4">
      {/* Already-saved offerings, shown as bordered banners */}
      {existing.map((o) => (
        <div
          key={o.id}
          className="rounded-input border border-border-subtle bg-bg-card px-4 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{o.title}</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {categoryLabel(o.category)} · {o.duration_minutes} min · $
                {(o.price_cents / 100).toFixed(2)}
              </p>
            </div>
            <span className="shrink-0 rounded-pill border border-live px-2 py-0.5 text-[10px] font-semibold text-live">
              Saved
            </span>
          </div>
        </div>
      ))}

      {/* New session field set(s) — created on Continue / Save & exit */}
      {drafts.map((d, i) => (
        <div
          key={i}
          className="rounded-input border border-border-subtle bg-bg-card p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">
              New session
            </span>
            {drafts.length > 1 && (
              <button
                type="button"
                onClick={() => removeDraft(i)}
                aria-label="Remove session"
                className="flex h-8 w-8 items-center justify-center rounded-pill text-text-tertiary transition-colors hover:text-error"
              >
                ×
              </button>
            )}
          </div>

          <div className="mt-2 space-y-3">
            <Input
              value={d.title}
              onChange={(e) => updateDraft(i, { title: e.target.value })}
              placeholder="Session title (e.g. Late-night chat)"
            />

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="w-full sm:flex-1">
                <Select
                  value={d.category}
                  onChange={(e) => updateDraft(i, { category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-full sm:flex-1">
                <Select
                  value={String(d.duration_minutes)}
                  onChange={(e) =>
                    updateDraft(i, {
                      duration_minutes: Number(e.target.value),
                    })
                  }
                >
                  {DURATIONS.map((dur) => (
                    <option key={dur} value={dur}>
                      {dur} minutes
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                $
              </span>
              <Input
                value={d.price_dollars}
                onChange={(e) => updateDraft(i, { price_dollars: e.target.value })}
                type="number"
                step="0.01"
                min="5"
                max="500"
                placeholder="20.00"
                className="pl-8"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addDraft}
        className="text-sm font-medium text-text-secondary transition-colors hover:text-white"
      >
        + Add another session
      </button>

      {error && <p className="text-sm text-error">{error}</p>}
      {saving && <p className="text-sm text-text-secondary">Saving…</p>}
    </div>
  );
});
