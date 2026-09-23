"use client";

import Link from "next/link";
import { formatCents } from "@/lib/format";
import s from "./PosterCard.module.css";

export interface PosterCreator {
  id: string;
  slug: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  categories: string[];
  offering_price: number;
}

const MAX_CHIPS = 2;

export function PosterCard({
  creator: c,
  labels,
  compact = false,
  className = "",
  priorityCategory,
  availableToday = false,
}: {
  creator: PosterCreator;
  labels: Record<string, string>;
  compact?: boolean;
  className?: string;
  /** Shown first among the chips, e.g. the category the visitor filtered by. */
  priorityCategory?: string | null;
  availableToday?: boolean;
}) {
  const unique = Array.from(new Set(c.categories));
  const cats =
    priorityCategory && unique.includes(priorityCategory)
      ? [priorityCategory, ...unique.filter((x) => x !== priorityCategory)]
      : unique;
  const shown = cats.slice(0, MAX_CHIPS);
  const overflow = cats.length - shown.length;
  const price = formatCents(c.offering_price);

  return (
    <Link
      href={c.slug ? `/@${c.slug}` : `/creators/${c.id}`}
      prefetch={false}
      className={`${s.poster} ${compact ? s.compact : ""} ${className}`}
      aria-label={`${c.display_name}${availableToday ? ", available today" : ""}, from ${price}`}
    >
      <span className={s.ini} aria-hidden="true">
        {c.display_name.charAt(0)}
      </span>
      {c.avatar_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.avatar_url}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <span className={s.meta}>
        <span className={s.chips}>
          {shown.map((cat) => (
            <span key={cat} className={s.chip}>
              {labels[cat] ?? cat}
            </span>
          ))}
          {overflow > 0 && <span className={`${s.chip} ${s.chipMore}`}>+{overflow}</span>}
        </span>
        <span className={s.name}>
          {availableToday && <span className={s.liveDot} title="Available today" />}
          {c.display_name}
        </span>
        {c.bio && <span className={s.bio}>{c.bio}</span>}
        <span className={s.price}>FROM {price}</span>
      </span>
    </Link>
  );
}
