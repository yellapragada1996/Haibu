import { permanentRedirect, notFound } from "next/navigation";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// /creators/[id] is a legacy URL. The canonical public profile is /@<slug>
// (app/[...slug]/page.tsx). This route looks up the creator and permanently
// redirects to the canonical handle so there is exactly ONE profile page.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CreatorByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [creator] = await db
    .select({
      slug: creatorProfiles.slug,
      is_published: creatorProfiles.is_published,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, id));

  if (!creator || !creator.is_published || !creator.slug) notFound();

  permanentRedirect(`/@${creator.slug}`);
}
