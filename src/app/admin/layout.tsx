import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { creatorProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NavBar } from "@/components/ui/NavBar";
import { AdminNav } from "./AdminNav";

// Admin shares the consumer dark design system and the same top NavBar as the
// rest of the product; the AdminNav pills below it are the admin section tabs.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [row] = await db
    .select({
      display_name: users.display_name,
      avatar_url: users.avatar_url,
      role_admin: users.role_admin,
      profile_id: creatorProfiles.id,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.user_id, users.id))
    .where(eq(users.id, user.id));

  // 404 for logged-in non-admins — don't leak that the panel exists.
  if (!row?.role_admin) notFound();

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <NavBar
        isLoggedIn
        isCreator={!!row?.profile_id}
        isAdmin
        userName={row?.display_name ?? user.email ?? ""}
        avatarUrl={row?.avatar_url ?? null}
      />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <AdminNav />
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
