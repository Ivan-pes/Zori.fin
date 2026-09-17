import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { getPersonalPlan } from "@/lib/billing/plan";
import { limitP, withinLimitP } from "@/lib/billing/entitlements.personal";

const upsert = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  category: z.string().trim().min(1).max(60),
  amountCents: z.number().int().min(0).max(100_000_000),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = upsert.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные бюджета" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  const { month, category, amountCents } = parsed.data;

  // Гейт Free-personal: максимум N категорий-конвертов в месяце.
  const [existing] = await sql<{ n: number; has: number }[]>`
    select count(*)::int as n,
           count(*) filter (where category = ${category})::int as has
    from budgets where org_id = ${orgId} and month = ${month}
  `;
  const isNew = (existing?.has ?? 0) === 0;
  if (isNew) {
    const pplan = await getPersonalPlan(orgId!);
    if (!withinLimitP(pplan, "budgetCategories", existing?.n ?? 0)) {
      return NextResponse.json(
        { error: "budgetCategoriesLimit", max: limitP(pplan, "budgetCategories") },
        { status: 403 }
      );
    }
  }

  await sql`
    insert into budgets (org_id, month, category, amount_cents)
    values (${orgId}, ${month}, ${category}, ${amountCents})
    on conflict (org_id, month, category)
    do update set amount_cents = ${amountCents}
  `;
  return NextResponse.json({ ok: true });
}

const del = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  category: z.string().trim().min(1).max(60),
});

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = del.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  await sql`
    delete from budgets where org_id = ${orgId} and month = ${parsed.data.month} and category = ${parsed.data.category}
  `;
  return NextResponse.json({ ok: true });
}
