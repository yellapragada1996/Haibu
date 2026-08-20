import { db } from "@/db";
import { users } from "@/db/schema";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { createServiceClient } from "@/lib/supabase/server";
import { UsersTable } from "../UsersTable";
import { AdminListControls } from "../AdminListControls";
import { Pager } from "../Pager";
import { EmptyState } from "../EmptyState";

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const { q: rawQ, role = "", page: rawPage } = await searchParams;
  const q = rawQ?.trim() ?? "";
  const page = Math.max(1, Number(rawPage) || 1);

  const like = q ? `%${q}%` : null;

  const roleCond =
    role === "admin"
      ? eq(users.role_admin, true)
      : role === "creator"
        ? eq(users.is_creator, true)
        : role === "fan"
          ? and(eq(users.is_creator, false), eq(users.role_admin, false))
          : undefined;

  const searchCond = like
    ? or(
        ilike(users.email, like),
        ilike(users.display_name, like),
        sql`${users.id}::text ILIKE ${like}`,
      )
    : undefined;

  const conds: SQL[] = [];
  if (roleCond) conds.push(roleCond);
  if (searchCond) conds.push(searchCond);
  const cond = conds.length ? and(...conds) : undefined;

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
    .orderBy(desc(users.created_at))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

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

  const pagerParams: Record<string, string> = {};
  if (q) pagerParams.q = q;
  if (role) pagerParams.role = role;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Users</h1>
      <AdminListControls
        base="/admin/users"
        param="role"
        placeholder="Search by email, name, or ID"
        q={q}
        filter={role}
        options={[
          { label: "All", value: "" },
          { label: "Admins", value: "admin" },
          { label: "Creators", value: "creator" },
          { label: "Guests", value: "fan" },
        ]}
      />
      {appUsers.length === 0 ? (
        <EmptyState
          label="users"
          q={q}
          clearHref={role ? `/admin/users?role=${encodeURIComponent(role)}` : "/admin/users"}
        />
      ) : (
        <>
          <UsersTable rows={rows} />
          <Pager base="/admin/users" params={pagerParams} page={page} hasNext={appUsers.length === PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
