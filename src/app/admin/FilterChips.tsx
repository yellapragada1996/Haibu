import Link from "next/link";

export function FilterChips({
  base,
  param,
  options,
  current,
}: {
  base: string;
  param: string;
  options: { label: string; value: string }[];
  current?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === "" ? !current : o.value === current;
        const href = o.value === "" ? base : `${base}?${param}=${encodeURIComponent(o.value)}`;
        return (
          <Link
            key={o.value}
            href={href}
            className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-accent text-white"
                : "bg-bg-card-hover text-text-secondary hover:text-white"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
