import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { getOrgPlan, getPersonalPlan } from "@/lib/billing/plan";
import { limitP, withinLimitP } from "@/lib/billing/entitlements.personal";
import { getAccountContext } from "@/lib/account/context";

const createSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["savings", "hire", "profit", "custom"]).default("custom"),
  title: z.string().trim().min(1).max(80),
  targetCents: z.number().int().positive(),
  currentCents: z.number().int().min(0),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "no organization" }, { status: 400 });

  const rows = await sql<{ id: string; kind: string; title: string; target_cents: string; current_cents: string }[]>`
    select id, kind, title, target_cents, current_cents from goals where org_id = ${orgId} order by created_at asc
  `;
  return NextResponse.json({ goals: rows });
}

export async function POST(req: NextRequest) {
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;

  const ctx = await getAccountContext(orgId);
  if (ctx?.type === "personal") {
    // Личное: Free = 1 цель, Plus = безлимит.
    const pplan = await getPersonalPlan(orgId);
    const [g] = await sql<{ n: number }[]>`select count(*)::int as n from goals where org_id = ${orgId}`;
    if (!withinLimitP(pplan, "goals", g?.n ?? 0)) {
      return NextResponse.json({ error: "goalsLimit", max: limitP(pplan, "goals") }, { status: 403 });
    }
  } else {
    const { plan } = await getOrgPlan(orgId);
    if (plan === "free") {
      return NextResponse.json({ error: "Цели доступны на тарифе Starter и выше." }, { status: 403 });
    }
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные цели" }, { status: 400 });
  const d = parsed.data;

  if (d.id) {
    await sql`
      update goals set kind = ${d.kind}, title = ${d.title}, target_cents = ${d.targetCents}, current_cents = ${d.currentCents}
      where id = ${d.id} and org_id = ${orgId}
    `;
    return NextResponse.json({ ok: true, id: d.id });
  }
  const [row] = await sql<{ id: string }[]>`
    insert into goals (org_id, kind, title, target_cents, current_cents)
    values (${orgId}, ${d.kind}, ${d.title}, ${d.targetCents}, ${d.currentCents})
    returning id
  `;
  return NextResponse.json({ ok: true, id: row?.id });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
  await sql`delete from goals where id = ${id} and org_id = ${orgId}`;
  return NextResponse.json({ ok: true });
}
