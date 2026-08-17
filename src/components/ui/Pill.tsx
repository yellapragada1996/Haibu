import type { ButtonHTMLAttributes } from "react";

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "active" | "inactive";
};

export function Pill({
  variant = "inactive",
  className = "",
  children,
  ...props
}: PillProps) {
  return (
    <button
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-3.5 py-[8px] text-xs font-medium transition-colors ${
        variant === "active"
          ? "bg-primary text-on-primary"
          : "bg-bg-card-hover text-text-secondary hover:text-white"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
