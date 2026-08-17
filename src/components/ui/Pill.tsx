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
      className={`inline-flex items-center rounded-pill px-5 py-2.5 text-[15px] font-medium transition-colors ${
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
