import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Admin is deliberately a plain light-mode utility UI (design doc exempts
// admin screens from the dark theme). It is NOT the consumer design system.
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
    .select({ role_admin: users.role_admin, email: users.email })
    .from(users)
    .where(eq(users.id, user.id));

  // 404 for logged-in non-admins — don't leak that the panel exists.
  if (!row?.role_admin) notFound();

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="font-semibold">haibu admin</span>
            <span className="text-xs text-gray-500">{row.email}</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-gray-700 hover:text-black">
              Reports
            </Link>
            <Link href="/admin/bookings" className="text-gray-700 hover:text-black">
              Bookings
            </Link>
            <Link href="/admin/users" className="text-gray-700 hover:text-black">
              Users
            </Link>
            <Link href="/" className="text-gray-500 hover:text-black">
              ← site
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
