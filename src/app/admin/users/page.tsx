import { db } from "@/db";
import { users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { createServiceClient } from "@/lib/supabase/server";
import { UsersTable } from "../UsersTable";
import { FilterChips } from "../FilterChips";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;

  const cond =
    role === "admin"
      ? eq(users.role_admin, true)
      : role === "creator"
        ? eq(users.is_creator, true)
        : role === "fan"
          ? and(eq(users.is_creator, false), eq(users.role_admin, false))
          : undefined;

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
    .where(cond)
    .orderBy(desc(users.created_at));

  // Suspension state lives in Supabase auth.users (banned_until).
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
    sync_error: error?.message ?? null,
  }));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Users</h1>
      <FilterChips
        base="/admin/users"
        param="role"
        current={role}
        options={[
          { label: "All", value: "" },
          { label: "Admins", value: "admin" },
          { label: "Creators", value: "creator" },
          { label: "Fans", value: "fan" },
        ]}
      />
      <UsersTable rows={rows} />
    </div>
  );
}
