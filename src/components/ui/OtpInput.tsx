"use client";

import { useContext } from "react";
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from "input-otp";

function OtpSlot({ index }: { index: number }) {
  const ctx = useContext(OTPInputContext);
  const slot = ctx.slots[index];
  const active = slot.isActive;
  return (
    <div
      className={`flex h-12 w-10 items-center justify-center rounded-pill border text-lg font-semibold text-white transition-colors ${
        active
          ? "border-accent bg-bg-card-hover"
          : "border-border-subtle bg-bg-base"
      }`}
    >
      {slot.char ? slot.char : active ? <span className="animate-pulse">|</span> : null}
    </div>
  );
}

export function OtpInput({
  value,
  onChange,
  length = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
}) {
  return (
    <OTPInput
      maxLength={length}
      value={value}
      onChange={onChange}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      containerClassName="flex justify-center gap-2"
    >
      {Array.from({ length }).map((_, i) => (
        <OtpSlot key={i} index={i} />
      ))}
    </OTPInput>
  );
}
