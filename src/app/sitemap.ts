import type { MetadataRoute } from "next";
import { db } from "@/db";
import { creatorProfiles, categories } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://haibu.live";

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/browse`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/search`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/support`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const categoryRows = await db
    .select({ slug: categories.slug })
    .from(categories)
    .orderBy(asc(categories.sort_order));

  const categoryPages: MetadataRoute.Sitemap = categoryRows.map((c) => ({
    url: `${base}/browse/${c.slug}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const creators = await db
    .select({ slug: creatorProfiles.slug, createdAt: creatorProfiles.created_at })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.is_published, true));

  const creatorPages: MetadataRoute.Sitemap = creators
    .filter((c) => c.slug)
    .map((c) => ({
      url: `${base}/@${c.slug}`,
      lastModified: c.createdAt,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  return [...staticPages, ...categoryPages, ...creatorPages];
}
