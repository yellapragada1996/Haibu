type BadgeVariant =
  | "live"
  | "confirmed"
  | "pending"
  | "cancelled"
  | "completed";

const styles: Record<BadgeVariant, string> = {
  live: "bg-live text-black",
  confirmed: "border border-live text-live",
  pending: "border border-text-secondary text-text-secondary",
  cancelled: "border border-text-tertiary text-text-tertiary",
  completed: "border border-white text-white",
};

export function Badge({
  variant,
  label,
  className = "",
}: {
  variant: BadgeVariant;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex rounded-pill px-2.5 py-0.5 text-xs font-medium ${styles[variant]} ${className}`}
    >
      {label ?? variant}
    </span>
  );
}
