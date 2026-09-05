import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { creatorProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProfileForm } from "./ProfileForm";

export default async function CreatorProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));

  const [userRow] = await db
    .select({ avatar_url: users.avatar_url, display_name: users.display_name })
    .from(users)
    .where(eq(users.id, user.id));

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">Profile</h1>
      <div className="mt-6">
        <ProfileForm
          existingBio={profile?.bio ?? ""}
          hasProfile={!!profile}
          avatarUrl={userRow?.avatar_url ?? null}
          bannerUrl={profile?.banner_url ?? null}
          displayName={userRow?.display_name ?? user.email ?? ""}
        />
      </div>
    </div>
  );
}
