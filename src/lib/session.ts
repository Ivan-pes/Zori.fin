import { cookies } from "next/headers";
import { auth } from "@/auth";
import { sql } from "./db";
import { activateInvitesForUser } from "./team";

export const ACTIVE_ORG_COOKIE = "active_org";

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export interface AccessibleOrg {
  id: string;
  name: string;
  role: string;
  isOwner: boolean;
  type: "business" | "personal";
}

export async function getAccessibleOrgs(): Promise<AccessibleOrg[]> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) return [];
  const email = session?.user?.email?.toLowerCase().trim() ?? "";

  const rows = await sql<{ id: string; name: string; role: string; is_owner: boolean; invited: boolean; type: string | null }[]>`
    select o.id, o.name, 'owner' as role, true as is_owner, false as invited, o.type
    from organizations o
    where o.owner_id = ${userId}
    union all
    select o.id, o.name, m.role, false as is_owner, (m.status = 'invited') as invited, o.type
    from memberships m
    join organizations o on o.id = m.org_id
    where ((m.user_id = ${userId} and m.status = 'active')
        or (m.status = 'invited' and lower(m.email) = ${email}))
      and o.owner_id <> ${userId}
    order by is_owner desc
  `;
  // Приглашение на email уже залогиненного пользователя активируем сразу,
  // не дожидаясь следующего входа (сессия живёт 30 дней).
  if (email && rows.some((r) => r.invited)) {
    await activateInvitesForUser(userId, email);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    isOwner: r.is_owner,
    type: r.type === "personal" ? "personal" as const : "business" as const,
  }));
}

export async function getCurrentOrgId(): Promise<string | null> {
  const orgs = await getAccessibleOrgs();
  if (orgs.length === 0) return null;

  const store = await cookies();
  const selected = store.get(ACTIVE_ORG_COOKIE)?.value;
  if (selected && orgs.some((o) => o.id === selected)) return selected;

  return orgs[0]?.id ?? null;
}

export async function getCurrentMembership(): Promise<{ orgId: string; role: string } | null> {
  const orgs = await getAccessibleOrgs();
  if (orgs.length === 0) return null;

  const store = await cookies();
  const selected = store.get(ACTIVE_ORG_COOKIE)?.value;
  const active = (selected && orgs.find((o) => o.id === selected)) || orgs[0];
  return active ? { orgId: active.id, role: active.role } : null;
}

export function canWrite(role: string): boolean {
  return role === "owner" || role === "finance";
}
