import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { createServiceClient } from "@/lib/supabase/server";
import { UsersTable } from "../UsersTable";

export default async function AdminUsersPage() {
  const appUsers = await db
    .select({
      id: users.id,
      email: users.email,
      display_name: users.display_name,
      is_creator: users.is_creator,
      role_admin: users.role_admin,
      created_at: users.created_at,
    })
    .from(users)
    .orderBy(desc(users.created_at));

  // Suspension state lives in Supabase auth.users (banned_until), not our
  // public.users table — fetch it via the service role and merge by id.
  const service = await createServiceClient();
  const { data, error } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  const banned = new Map<string, string | null>();
  for (const u of data?.users ?? []) banned.set(u.id, u.banned_until ?? null);

  const rows = appUsers.map((u) => ({
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    is_creator: u.is_creator,
    role_admin: u.role_admin,
    created_at: u.created_at ? u.created_at.toISOString() : "",
    banned_until: banned.get(u.id) ?? null,
    // Surface listUsers errors inline rather than silently rendering empty.
    sync_error: error?.message ?? null,
  }));

  return <UsersTable rows={rows} />;
}
