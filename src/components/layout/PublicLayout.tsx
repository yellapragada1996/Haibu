import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/ui/NavBar";
import { BottomNav } from "@/components/ui/BottomNav";
import { db } from "@/db";
import { creatorProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ReactNode } from "react";

export async function PublicLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoggedIn = !!user;
  let isCreator = false;
  let isAdmin = false;
  let displayName = "";
  let avatarUrl: string | null = null;

  if (user) {
    const [profile] = await db
      .select({
        display_name: users.display_name,
        avatar_url: users.avatar_url,
        role_admin: users.role_admin,
        profile_id: creatorProfiles.id,
      })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.user_id, users.id))
      .where(eq(users.id, user.id));
    isCreator = !!profile?.profile_id;
    isAdmin = !!profile?.role_admin;
    displayName = profile?.display_name ?? user.email ?? "";
    avatarUrl = profile?.avatar_url ?? null;
  }

  return (
    <>
      <NavBar
        isLoggedIn={isLoggedIn}
        isCreator={isCreator}
        isAdmin={isAdmin}
        userName={displayName}
        avatarUrl={avatarUrl}
      />
      <div className="pb-16 md:pb-0">{children}</div>
      <BottomNav isLoggedIn={isLoggedIn} isCreator={isCreator} />
    </>
  );
}
