import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Public handle generation — single source of truth for a creator's @handle.
// The public profile URL is `haibu.live/@<slug>` (see app/[...slug]/page.tsx).
// ---------------------------------------------------------------------------

// Turn a display name into a URL-safe handle: lowercase, spaces→hyphens,
// strip anything that isn't a letter, number, or hyphen.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Generate a unique slug for a creator. If the base is empty (e.g. the name
// was all symbols/emoji) it falls back to "creator". Collisions get a numeric
// suffix: `queen` → `queen-2` → `queen-3`, … (the same convention GitHub/
// Instagram/YouTube use).
export async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "creator";
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existing] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}
