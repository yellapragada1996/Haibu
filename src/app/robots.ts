import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/dashboard/", "/creator/", "/bookings/", "/verify-email", "/suspended"],
    },
    sitemap: "https://haibu.live/sitemap.xml",
  };
}
