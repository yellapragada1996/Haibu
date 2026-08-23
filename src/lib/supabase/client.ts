import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Non-empty fallbacks keep the Vercel build from crashing when the
  // NEXT_PUBLIC_* vars aren't inlined (they're set in the environment, not the
  // repo). Real values are inlined at build time and used at runtime.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
  );
}
