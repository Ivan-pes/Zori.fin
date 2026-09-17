import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { requireWritableOrg } from "@/lib/guard-write";

const schema = z.object({
  salaryCents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
  extraIncomeCents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
  paydayDay: z.number().int().min(1).max(31).nullable().optional(),
});

/**
 * Доход руками (личный режим): зарплата + доп. доходы. Имеет приоритет над
 * автодетектом и питает план трат («тратить не больше N% дохода»).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные дохода" }, { status: 400 });
  const d = parsed.data;

  if (d.salaryCents !== undefined) {
    await sql`update organizations set salary_cents = ${d.salaryCents} where id = ${guard.orgId}`;
  }
  if (d.extraIncomeCents !== undefined) {
    await sql`update organizations set extra_income_cents = ${d.extraIncomeCents} where id = ${guard.orgId}`;
  }
  if (d.paydayDay !== undefined) {
    await sql`update organizations set payday_day = ${d.paydayDay} where id = ${guard.orgId}`;
  }

  // Умный дефолт: доход задан, а режим трат ещё не выбран → включаем «Норму»
  // (70%), чтобы «можно потратить» сразу считалось от зарплаты, а не от остатка.
  await sql`
    update organizations set spend_target_pct = 70
    where id = ${guard.orgId}
      and spend_target_pct is null
      and coalesce(salary_cents, 0) + coalesce(extra_income_cents, 0) > 0
  `;
  return NextResponse.json({ ok: true });
}
