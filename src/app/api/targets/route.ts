import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { getOrgPlan, isGrowthPlus } from "@/lib/billing/plan";

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  metric: z.enum(["revenue", "expense", "profit"]),
  amountCents: z.number().int().min(0).nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const [org] = await sql<{ id: string }[]>`
    select id from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) return NextResponse.json({ error: "no organization" }, { status: 400 });

  const { plan } = await getOrgPlan(org.id);
  if (!isGrowthPlus(plan)) {
    return NextResponse.json({ error: "Бюджеты доступны на тарифе Growth и выше" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const { month, metric, amountCents } = parsed.data;

  if (amountCents === null || amountCents === 0) {
    await sql`delete from targets where org_id = ${org.id} and month = ${month} and metric = ${metric}`;
    return NextResponse.json({ ok: true, cleared: true });
  }

  await sql`
    insert into targets (org_id, month, metric, amount_cents)
    values (${org.id}, ${month}, ${metric}, ${amountCents})
    on conflict (org_id, month, metric) do update set amount_cents = excluded.amount_cents
  `;
  return NextResponse.json({ ok: true });
}
