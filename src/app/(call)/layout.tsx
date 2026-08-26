import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Call-screen layout: deliberately MINIMAL — no site NavBar here. The call
// screen gets only its own in-call header (title, countdown, Leave); the
// global nav would be dead weight (and a distraction) during a paid session.
// Auth still enforced — the token API gates identity per booking.
export default async function CallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const hdrs = await headers();
    const path = hdrs.get("x-pathname") || "/dashboard";
    redirect(`/login?redirect=${encodeURIComponent(path)}`);
  }

  return <div className="min-h-dvh bg-bg-base">{children}</div>;
}
