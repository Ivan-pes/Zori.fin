import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { getOrgPlan, isGrowthPlus } from "@/lib/billing/plan";


async function orgFor(userId: string) {
  const [org] = await sql<{ id: string }[]>`
    select id from organizations where id = ${await getCurrentOrgId()}
  `;
  return org ?? null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const org = await orgFor(session.user.id);
  if (!org) return NextResponse.json({ error: "no organization" }, { status: 400 });

  const rows = await sql<{ id: string; name: string; assumptions: Record<string, number> }[]>`
    select id, name, assumptions from cashflow_scenarios where org_id = ${org.id} order by created_at asc
  `;
  return NextResponse.json({ scenarios: rows });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  monthlyDeltaCents: z.number().int().optional(),
  oneOffCents: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const org = await orgFor(session.user.id);
  if (!org) return NextResponse.json({ error: "no organization" }, { status: 400 });

  const { plan } = await getOrgPlan(org.id);
  if (!isGrowthPlus(plan)) {
    return NextResponse.json({ error: "Сценарии доступны на тарифе Growth и выше" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const assumptions = {
    monthlyDeltaCents: parsed.data.monthlyDeltaCents ?? 0,
    oneOffCents: parsed.data.oneOffCents ?? 0,
  };
  const [row] = await sql<{ id: string }[]>`
    insert into cashflow_scenarios (org_id, name, assumptions)
    values (${org.id}, ${parsed.data.name}, ${sql.json(assumptions)})
    returning id
  `;
  return NextResponse.json({ ok: true, id: row?.id });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const org = await orgFor(session.user.id);
  if (!org) return NextResponse.json({ error: "no organization" }, { status: 400 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
  await sql`delete from cashflow_scenarios where id = ${id} and org_id = ${org.id}`;
  return NextResponse.json({ ok: true });
}
