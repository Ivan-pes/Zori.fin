import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { upsertUserRule } from "@/lib/categorize/rules";

const schema = z.object({
  id: z.string().min(1),
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).nullable().optional(),
});

/**
 * Пользователь меняет категорию транзакции (§4.3).
 * 1) проставляем category + method='user' + confidence=1 (выход из review-queue);
 * 2) обучаемся: апсертим правило по merchantKey — впредь тот же мерчант
 *    категоризируется мгновенно и стабильно.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "Организация не выбрана" }, { status: 400 });
  const { id, category } = parsed.data;
  const subcategory = parsed.data.subcategory ?? null;

  const [row] = await sql<{ description: string | null }[]>`
    update transactions
    set category = ${category},
        subcategory = ${subcategory},
        category_method = 'user',
        category_confidence = 1
    where id = ${id} and org_id = ${orgId}
    returning description
  `;
  if (!row) return NextResponse.json({ error: "Транзакция не найдена" }, { status: 404 });

  const learned = await upsertUserRule(orgId, row.description, category, subcategory);
  return NextResponse.json({ ok: true, learned });
}
