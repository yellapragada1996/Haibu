import { Card } from "./Card";

type CreatorCardProps = {
  name: string;
  categories: string[];
  priceCents: number;
  durationMinutes: number;
  rating: number;
  sessionCount: number;
  thumbnailUrl?: string | null;
  availableToday?: boolean;
  categoryLabels?: Record<string, string>;
};

const MAX_CATEGORY_PILLS = 3;

export function CreatorCard({
  name,
  categories,
  priceCents,
  durationMinutes,
  rating,
  sessionCount,
  thumbnailUrl,
  availableToday,
  categoryLabels,
}: CreatorCardProps) {
  // Distinct categories, capped display with +N overflow indicator.
  const distinct = Array.from(new Set(categories));
  const shown = distinct.slice(0, MAX_CATEGORY_PILLS);
  const overflow = distinct.length - shown.length;

  return (
    <Card hover className="w-[280px] flex-shrink-0 !p-0 overflow-hidden">
      <div className="aspect-[4/3] bg-bg-card-hover flex items-center justify-center rounded-t-card overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-text-tertiary text-3xl font-bold">
            {name.charAt(0)}
          </span>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-white truncate">
            {name}
          </span>
          {availableToday && (
            <span className="flex items-center gap-1 text-xs text-live">
              <span className="w-1.5 h-1.5 rounded-full bg-live" />
              Available
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {shown.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center rounded-pill bg-brand px-2 py-0.5 text-[10px] font-medium text-white"
            >
              {categoryLabels?.[cat] ?? cat}
            </span>
          ))}
          {overflow > 0 && (
            <span className="inline-flex items-center rounded-pill bg-bg-card-hover px-2 py-0.5 text-[10px] font-medium text-text-secondary">
              +{overflow}
            </span>
          )}
          <span className="text-text-secondary text-xs">
            ${(priceCents / 100).toFixed(0)} / {durationMinutes} min
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span>★ {rating > 0 ? rating.toFixed(1) : "—"}</span>
          <span>{sessionCount} sessions</span>
        </div>
      </div>
    </Card>
  );
}
