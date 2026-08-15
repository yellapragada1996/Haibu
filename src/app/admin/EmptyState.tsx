import Link from "next/link";

export function EmptyState({
  label,
  q,
  clearHref,
}: {
  label: string;
  q?: string;
  clearHref?: string;
}) {
  if (q) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-text-secondary">
          No {label} match &ldquo;{q}&rdquo;
        </p>
        {clearHref && (
          <Link
            href={clearHref}
            className="mt-2 inline-block text-sm font-medium text-accent hover:text-accent-hover"
          >
            Clear search
          </Link>
        )}
      </div>
    );
  }

  return <p className="text-sm text-text-secondary">No {label} yet.</p>;
}
