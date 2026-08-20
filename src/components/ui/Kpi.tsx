import type { ReactNode } from "react";
import { Card } from "./Card";

export function Kpi({
  label,
  value,
  hint,
  sub,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  sub?: string;
}) {
  return (
    <Card className="group relative space-y-1">
      <p className="text-xs uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-text-secondary">{sub}</p>}
      {hint && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-48 rounded-input bg-bg-surface p-2.5 text-xs font-normal normal-case tracking-normal text-text-secondary shadow-xl ring-1 ring-border-subtle group-hover:block"
        >
          {hint}
        </div>
      )}
    </Card>
  );
}
