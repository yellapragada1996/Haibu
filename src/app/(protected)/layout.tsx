import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TimezoneCapture } from "@/components/TimezoneCapture";
import { EmailGate } from "@/components/EmailGate";
import { NavBar } from "@/components/ui/NavBar";
import { BottomNav } from "@/components/ui/BottomNav";
import { db } from "@/db";
import { creatorProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) return <EmailGate />;

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

  return (
    <div className="min-h-screen bg-bg-base">
      <NavBar
        isLoggedIn
        isCreator={!!profile?.profile_id}
        isAdmin={!!profile?.role_admin}
        userName={profile?.display_name ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
      />
      <main className="pb-16 md:pb-0">{children}</main>
      <BottomNav isLoggedIn isCreator={!!profile?.profile_id} />
      <TimezoneCapture />
    </div>
  );
}
