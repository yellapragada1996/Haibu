type CreatorCardProps = {
  name: string;
  categories: string[];
  priceCents: number;
  durationMinutes?: number;
  rating: number;
  sessionCount?: number;
  thumbnailUrl?: string | null;
  availableToday?: boolean;
  categoryLabels?: Record<string, string>;
};

const MAX_CATEGORY_PILLS = 2;

// Tall poster card (≈200×380, 3:4) — the atomic discovery unit.
export function CreatorCard({
  name,
  categories,
  priceCents,
  rating,
  thumbnailUrl,
  categoryLabels,
}: CreatorCardProps) {
  const distinct = Array.from(new Set(categories));
  const shown = distinct.slice(0, MAX_CATEGORY_PILLS);
  const overflow = distinct.length - shown.length;

  return (
    <div className="flex aspect-[3/4] w-full flex-col overflow-hidden rounded-card border border-border-subtle bg-bg-card transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      {/* Thumbnail — top ~70% */}
      <div className="relative min-h-0 w-full flex-[7] overflow-hidden bg-bg-card-hover">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-3xl font-bold text-text-tertiary">
              {name.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Body — bottom ~30% */}
      <div className="flex min-h-0 flex-[3] flex-col gap-1.5 p-3">
        <p className="truncate text-[13px] font-semibold text-white">{name}</p>
        <div className="flex flex-wrap items-center gap-1">
          {shown.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center rounded-pill bg-brand px-2 py-0.5 text-[9px] font-medium text-white"
            >
              {categoryLabels?.[cat] ?? cat}
            </span>
          ))}
          {overflow > 0 && (
            <span className="inline-flex items-center rounded-pill bg-bg-card-hover px-2 py-0.5 text-[9px] font-medium text-text-secondary">
              +{overflow}
            </span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between">
          {/* Rating only when it exists — no grayed "★ —" */}
          {rating > 0 ? (
            <span className="text-xs font-semibold text-rating">
              ★ {rating.toFixed(1)}
            </span>
          ) : null}
          <span className="ml-auto text-xs text-text-secondary">
            From ${(priceCents / 100).toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  );
}
