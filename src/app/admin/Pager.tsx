import Link from "next/link";

export function Pager({
  base,
  params,
  page,
  hasNext,
}: {
  base: string;
  params: Record<string, string>;
  page: number;
  hasNext: boolean;
}) {
  function href(p: number) {
    const sp = new URLSearchParams(params);
    sp.set("page", String(p));
    return `${base}?${sp.toString()}`;
  }

  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-text-tertiary">Page {page}</span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="rounded-pill border border-border-subtle px-4 py-1.5 text-text-secondary hover:text-text-primary"
          >
            ← Prev
          </Link>
        )}
        {hasNext && (
          <Link
            href={href(page + 1)}
            className="rounded-pill border border-border-subtle px-4 py-1.5 text-text-secondary hover:text-text-primary"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}
