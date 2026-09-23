import Link from "next/link";
import type { ReactNode } from "react";
import { PosterCard, type PosterCreator } from "@/components/ui/PosterCard";
import { EdgeScroller } from "@/components/ui/EdgeScroller";
import c from "./catalog.module.css";

export interface CatalogPill {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

export function CatalogView({
  kicker,
  title,
  live = false,
  subtitle,
  pills,
  creators,
  labels,
  emptyText,
  emptyCta,
  priorityCategory,
}: {
  kicker: string;
  title: ReactNode;
  live?: boolean;
  subtitle?: ReactNode;
  pills: CatalogPill[];
  creators: PosterCreator[];
  labels: Record<string, string>;
  emptyText: ReactNode;
  emptyCta?: { label: string; href: string };
  priorityCategory?: string;
}) {
  return (
    <main className={c.main}>
      <header className={c.wrap}>
        <span className={c.mono}>{kicker}</span>
        <h1 className={c.title}>
          {live && <span className={c.liveDot} />}
          {title}
        </h1>
        {subtitle && <p className={c.sub}>{subtitle}</p>}
      </header>

      {pills.length > 1 && (
        <nav aria-label="Filter by category">
          <EdgeScroller
            label="categories"
            className={c.pills}
            wrapClassName={c.pillsWrap}
            fade="72px"
          >
            {pills.map((p) => (
              <Link
                key={p.key}
                href={p.href}
                className={c.pill}
                aria-current={p.active ? "page" : undefined}
              >
                {p.label}
              </Link>
            ))}
          </EdgeScroller>
        </nav>
      )}

      <div className={c.wrap}>
        {creators.length > 0 ? (
          <div className={c.grid}>
            {creators.map((creator) => (
              <PosterCard
                key={creator.id}
                creator={creator}
                labels={labels}
                priorityCategory={priorityCategory}
                compact
              />
            ))}
          </div>
        ) : (
          <div className={c.empty}>
            <p className={c.emptyText}>{emptyText}</p>
            {emptyCta && (
              <Link href={emptyCta.href} className={c.emptyCta}>
                {emptyCta.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
