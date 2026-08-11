import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TimezoneCapture } from "@/components/TimezoneCapture";
import Link from "next/link";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-[#121212]">
      <nav className="flex items-center justify-between border-b border-[#1A1A1A] px-6 py-3">
        <Link href="/dashboard" className="text-lg font-semibold text-white">
          haibu
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#8A8A8A]">
            {profile?.display_name ?? user.email}
          </span>
          <form action="/api/auth/signout" method="POST">
            <button className="rounded-xl bg-[#232323] px-3 py-1.5 text-sm text-white transition hover:bg-[#2A2A2A]">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main>{children}</main>
      <TimezoneCapture />
    </div>
  );
}
