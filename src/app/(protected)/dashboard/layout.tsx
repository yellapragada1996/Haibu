import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DashboardNav } from "@/components/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.user_id, user.id));

  return (
    <div className="min-h-screen md:flex">
      <DashboardNav isCreator={!!profile} />
      <div className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-2xl">{children}</div>
      </div>
    </div>
  );
}
