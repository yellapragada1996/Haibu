import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  padding?: boolean;
};

export function Card({
  hover = false,
  padding = true,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-card bg-bg-card ${
        padding ? "p-4" : ""
      } ${
        hover
          ? "transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
