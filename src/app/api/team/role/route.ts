import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { requireOwnerOrg } from "@/lib/guard-write";
import { isValidMemberLabel } from "@/lib/team-labels";

// Владелец меняет роль (права) и/или подпись «кто это» участника.
const schema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(["finance", "viewer"]).optional(),
    label: z.string().max(30).nullable().optional(),
  })
  .refine((d) => d.role !== undefined || d.label !== undefined, { message: "nothing to update" });

export async function POST(req: NextRequest) {
  const guard = await requireOwnerOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const { id, role } = parsed.data;

  let label = parsed.data.label;
  if (typeof label === "string") {
    const [org] = await sql<{ type: string | null }[]>`
      select type from organizations where id = ${orgId}
    `;
    if (!isValidMemberLabel(label, org?.type === "personal")) label = null;
  }

  const rows =
    label !== undefined
      ? await sql<{ id: string; email: string; role: string; status: string; label: string | null }[]>`
          update memberships set role = coalesce(${role ?? null}, role), label = ${label}
          where id = ${id} and org_id = ${orgId} and status != 'revoked'
          returning id, email, role, status, label
        `
      : await sql<{ id: string; email: string; role: string; status: string; label: string | null }[]>`
          update memberships set role = coalesce(${role ?? null}, role)
          where id = ${id} and org_id = ${orgId} and status != 'revoked'
          returning id, email, role, status, label
        `;
  const member = rows[0];
  if (!member) {
    return NextResponse.json({ error: "Участник не найден" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, member });
}
