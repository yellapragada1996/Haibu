"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { updatePlatformFeeRate } from "../actions";

export function FeeForm({ currentRate }: { currentRate: number }) {
  const router = useRouter();
  const [rate, setRate] = useState(currentRate);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const changed = rate !== currentRate;
  const pct = Math.round(rate * 100);

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  const handleSave = async () => {
    setSaveState("saving");
    setError(null);
    const result = await updatePlatformFeeRate(rate);
    if ("error" in result) {
      setError(result.error);
      setSaveState("idle");
    } else {
      setSaveState("saved");
      router.refresh();
    }
  };

  const previewPrice = 5000;
  const previewFee = Math.round(previewPrice * rate);
  const previewPayout = previewPrice - previewFee;

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-input bg-bg-card-hover text-sm text-text-secondary">
          %
        </div>
        <h2 className="text-lg font-semibold text-text-primary">Platform fee</h2>
      </div>

      {/* Current rate display */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">Current rate</span>
        <span className="text-2xl font-bold text-text-primary">{pct}%</span>
      </div>

      {/* Slider */}
      <div>
        <label className="mb-2 block text-sm font-medium text-text-secondary">
          Adjust rate
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-tertiary">1%</span>
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={pct}
            onChange={(e) => setRate(parseInt(e.target.value) / 100)}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-pill bg-bg-card-hover accent-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
          <span className="min-w-[3ch] text-right text-sm font-semibold text-text-primary">
            {pct}%
          </span>
        </div>
      </div>

      {/* Preview split */}
      <div className="rounded-input bg-bg-base p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-text-tertiary">
          Preview on a $50 session
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Session price</span>
            <span className="text-text-primary">$50.00</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Platform fee</span>
            <span className="font-medium text-text-primary">
              ${(previewFee / 100).toFixed(2)}
            </span>
          </div>
          <div className="border-t border-border-subtle pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Creator payout</span>
              <span className="font-medium text-text-primary">
                ${(previewPayout / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Info note */}
      <p className="text-xs text-text-tertiary">
        Applies to new bookings only. Existing bookings keep the rate they were
        booked at. The Terms of Service reference &ldquo;a platform fee&rdquo;
        without specifying the percentage.
      </p>

      {error && <p className="text-sm text-error">{error}</p>}

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {changed && saveState === "idle" && (
          <button
            type="button"
            onClick={() => setRate(currentRate)}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Reset
          </button>
        )}
        <Button
          onClick={handleSave}
          disabled={!changed || saveState !== "idle"}
        >
          {saveState === "saving"
            ? "Saving..."
            : saveState === "saved"
              ? "Saved ✓"
              : "Save"}
        </Button>
      </div>
    </Card>
  );
}
