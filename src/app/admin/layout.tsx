import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Logo } from "@/components/ui/Logo";
import { AdminNav } from "./AdminNav";

// Admin shares the consumer dark design system (per Raghav's call to bring it
// in line with the rest of the product, superseding the "light utility is
// fine" exemption in the design doc).
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
    <div className="min-h-screen bg-bg-base text-white">
      <header className="border-b border-border-subtle bg-bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex-shrink-0">
              <Logo height={32} />
            </Link>
            <span className="rounded-pill border border-border-subtle px-2 py-0.5 text-xs font-medium text-text-secondary">
              admin
            </span>
          </div>
          <span className="text-xs text-text-tertiary">{row.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <AdminNav />
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
