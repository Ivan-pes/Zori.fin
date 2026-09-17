import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { requireWritableOrg } from "@/lib/guard-write";
import { EXPENSE_CATEGORIES, PERSONAL_CATEGORIES } from "@/lib/categorize/categories";

const schema = z.object({ name: z.string().trim().min(1).max(40) });

const BASE = new Set<string>([...EXPENSE_CATEGORIES, ...PERSONAL_CATEGORIES]);

/** Создать свою категорию (попадает в селекты, бюджеты и AI-классификатор). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректное название" }, { status: 400 });
  const name = parsed.data.name;
  if (BASE.has(name)) return NextResponse.json({ error: "Такая категория уже есть" }, { status: 400 });

  await sql`
    insert into custom_categories (org_id, name) values (${guard.orgId}, ${name})
    on conflict (org_id, name) do nothing
  `;
  return NextResponse.json({ ok: true });
}

const renameSchema = z.object({
  from: z.string().trim().min(1).max(40),
  to: z.string().trim().min(1).max(40),
});

/**
 * Переименовать свою категорию: тянет за собой транзакции, конверты,
 * правила обучения, ручные платежи и плановые операции.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;

  const parsed = renameSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const { from, to } = parsed.data;
  if (from === to) return NextResponse.json({ ok: true });
  if (BASE.has(from)) return NextResponse.json({ error: "Базовую категорию нельзя переименовать" }, { status: 400 });
  if (BASE.has(to)) return NextResponse.json({ error: "Такое имя занято базовой категорией" }, { status: 400 });

  const [exists] = await sql<{ name: string }[]>`
    select name from custom_categories where org_id = ${orgId} and name = ${from}
  `;
  if (!exists) return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });

  await sql`
    insert into custom_categories (org_id, name) values (${orgId}, ${to})
    on conflict (org_id, name) do nothing
  `;
  await sql`delete from custom_categories where org_id = ${orgId} and name = ${from}`;
  await sql`update transactions set category = ${to} where org_id = ${orgId} and category = ${from}`;
  await sql`update category_rules set category = ${to} where org_id = ${orgId} and category = ${from}`;
  await sql`update manual_subscriptions set category = ${to} where org_id = ${orgId} and category = ${from}`;
  await sql`update planned_items set category = ${to} where org_id = ${orgId} and category = ${from}`;
  // Конверты: если на месяц уже есть конверт с новым именем — старый убираем,
  // иначе переносим (обходим конфликт первичного ключа org+month+category).
  await sql`
    delete from budgets b
    where b.org_id = ${orgId} and b.category = ${from}
      and exists (select 1 from budgets t where t.org_id = b.org_id and t.month = b.month and t.category = ${to})
  `;
  await sql`update budgets set category = ${to} where org_id = ${orgId} and category = ${from}`;

  return NextResponse.json({ ok: true });
}

/**
 * Удалить свою категорию. Транзакции с ней отправляем в review-queue
 * (category=null), правила обучения по ней тоже чистим.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректное название" }, { status: 400 });
  const name = parsed.data.name;

  await sql`delete from custom_categories where org_id = ${guard.orgId} and name = ${name}`;
  await sql`
    update transactions set category = null, category_method = null, category_confidence = null
    where org_id = ${guard.orgId} and category = ${name}
  `;
  await sql`delete from category_rules where org_id = ${guard.orgId} and category = ${name}`;
  return NextResponse.json({ ok: true });
}
