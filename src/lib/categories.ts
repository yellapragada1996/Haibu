import { cache } from "react";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc } from "drizzle-orm";

export type Category = {
  slug: string;
  display_label: string;
  sort_order: number;
};

// Single source of truth for the category list: the `categories` table.
// `React.cache` dedupes this read to once per request — every component that
// calls it in the same render shares one DB query. Deliberately NOT a
// cross-request TTL cache: categories change rarely, but a newly inserted
// category must show up on the very next request (no staleness window).
export const getCategories = cache(async (): Promise<Category[]> => {
  const rows = await db
    .select({
      slug: categories.slug,
      display_label: categories.display_label,
      sort_order: categories.sort_order,
    })
    .from(categories)
    .orderBy(asc(categories.sort_order));

  return rows;
});

// Pure helper: slug -> display label map for passing down to client components.
export function categoriesToLabelMap(
  list: Category[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of list) map[c.slug] = c.display_label;
  return map;
}
