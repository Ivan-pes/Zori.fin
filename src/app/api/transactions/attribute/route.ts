import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";

const schema = z.object({
  id: z.string().min(1),
  memberId: z.string().uuid().nullable(),  // null = общее
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const orgId = await getCurrentOrgId();

  // member_id должен быть владельцем или активным участником этой организации.
  if (parsed.data.memberId) {
    const [ok] = await sql<{ n: number }[]>`
      select count(*)::int as n from (
        select owner_id as uid from organizations where id = ${orgId} and owner_id = ${parsed.data.memberId}
        union all
        select user_id from memberships
        where org_id = ${orgId} and user_id = ${parsed.data.memberId} and status = 'active'
      ) t
    `;
    if (!ok?.n) {
      return NextResponse.json({ error: "Участник не найден в этой организации" }, { status: 400 });
    }
  }

  // Обновляем только транзакцию своей организации.
  await sql`
    update transactions set member_id = ${parsed.data.memberId}
    where id = ${parsed.data.id} and org_id = ${orgId}
  `;
  return NextResponse.json({ ok: true });
}
