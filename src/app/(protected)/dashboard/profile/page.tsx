import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProfileForm } from "./ProfileForm";

export default async function DashboardProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [userRow] = await db
    .select({ display_name: users.display_name, avatar_url: users.avatar_url })
    .from(users)
    .where(eq(users.id, user.id));

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Profile</h1>
      <p className="mb-6 mt-1 text-sm text-text-secondary">
        Your display name and avatar are shared across the whole platform.
      </p>
      <ProfileForm
        displayName={userRow?.display_name ?? user.email ?? ""}
        avatarUrl={userRow?.avatar_url ?? null}
      />
    </div>
  );
}
