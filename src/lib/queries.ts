import { db } from "@/db";
import { creatorProfiles, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function getPublishedCreators() {
  return db
    .select({
      id: creatorProfiles.id,
      user_id: creatorProfiles.user_id,
      category: creatorProfiles.category,
      bio: creatorProfiles.bio,
      banner_url: creatorProfiles.banner_url,
      intro_video_url: creatorProfiles.intro_video_url,
      identity_verified: creatorProfiles.identity_verified,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(eq(creatorProfiles.is_published, true));
}
