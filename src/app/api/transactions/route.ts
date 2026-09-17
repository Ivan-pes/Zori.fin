import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { resolveHistoryFloor } from "@/lib/billing/history";
import { getBaseCurrency } from "@/lib/transactions";
import { getRates, convertCents } from "@/lib/fx";
import { getAccountContext } from "@/lib/account/context";
import { categorizeByRulesFor } from "@/lib/categorize/categories";

interface Row {
  id: string;
  source: string;
  kind: string;
  direction: "income" | "expense";
  gross_cents: string;
  fee_cents: string;
  net_cents: string;
  currency: string;
  occurred_at: Date;
  description: string | null;
  category: string | null;
  member_id: string | null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const [org] = await sql<{ id: string }[]>`
    select id from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) {
    return NextResponse.json({ error: "no organization" }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const search = (sp.get("search") ?? "").trim();
  const type = sp.get("type");
  const source = sp.get("source");
  const period = sp.get("period") ?? "month";
  const sortBy = sp.get("sortBy") === "amount" ? "amount" : "date";
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "25", 10) || 25, 1), 100);
  const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);

  const now = new Date();
  let from: Date | null = null;
  if (period === "month") from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  else if (period === "30") from = new Date(now.getTime() - 30 * 86_400_000);
  else if (period === "90") from = new Date(now.getTime() - 90 * 86_400_000);

  // Глубина истории — по типу пространства (личная/бизнес сетка).
  const floor = await resolveHistoryFloor(org.id);
  let effFrom = from;
  if (floor && (!effFrom || effFrom < floor)) effFrom = floor;

  let where = sql`org_id = ${org.id}`;
  if (effFrom) where = sql`${where} and occurred_at >= ${effFrom}`;
  if (type === "income" || type === "expense") where = sql`${where} and direction = ${type}`;
  if (source === "stripe" || source === "manual" || source === "paypal" || source === "gocardless" || source === "csv") where = sql`${where} and source = ${source}`;
  if (search) where = sql`${where} and description ilike ${"%" + search + "%"}`;

  const orderCol = sortBy === "amount" ? sql`gross_cents` : sql`occurred_at`;
  const orderDir = sortDir === "asc" ? sql`asc` : sql`desc`;

  const rows = await sql<Row[]>`
    select id, source, kind, direction, gross_cents, fee_cents, net_cents, currency, occurred_at, description, category, member_id
    from transactions where ${where}
    order by ${orderCol} ${orderDir}, id asc
    limit ${limit} offset ${offset}
  `;

  const byCur = await sql<{ currency: string; income: string; expense: string; fees: string; count: number }[]>`
    select
      currency,
      coalesce(sum(case when direction = 'income' then gross_cents else 0 end), 0)::bigint as income,
      coalesce(sum(case when direction = 'expense' then gross_cents else 0 end), 0)::bigint as expense,
      coalesce(sum(fee_cents), 0)::bigint as fees,
      count(*)::int as count
    from transactions where ${where}
    group by currency
  `;

  const base = await getBaseCurrency(org.id);
  const rates = await getRates();
  let incomeCents = 0;
  let expenseCents = 0;
  let feeCents = 0;
  let count = 0;
  for (const c of byCur) {
    const from = c.currency;
    incomeCents += convertCents(Number(c.income), from, base, rates);
    expenseCents += convertCents(Number(c.expense), from, base, rates);
    feeCents += convertCents(Number(c.fees), from, base, rates);
    count += Number(c.count);
  }

  return NextResponse.json({
    base,
    rows: rows.map((r) => {
      const from = r.currency;
      return {
        id: r.id,
        source: r.source,
        kind: r.kind,
        direction: r.direction,
        grossCents: convertCents(Number(r.gross_cents), from, base, rates),
        feeCents: convertCents(Number(r.fee_cents), from, base, rates),
        netCents: convertCents(Number(r.net_cents), from, base, rates),
        currency: base,
        origCurrency: from.toUpperCase() === base ? undefined : from.toUpperCase(),
        origGrossCents: from.toUpperCase() === base ? undefined : Number(r.gross_cents),
        occurredAt: r.occurred_at,
        description: r.description,
        category: r.category,
        memberId: r.member_id,
      };
    }),
    totals: { incomeCents, expenseCents, netCents: incomeCents - expenseCents, feeCents, count },
    hasMore: offset + rows.length < count,
  });
}

const createSchema = z.object({
  direction: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive().max(100_000_000_000),
  description: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Ручная операция (личный режим без банка): «потратил столько-то» / «получил
 * столько-то». source='manual' → попадает во все графики/категории/сигналы.
 * Категория: выбор пользователя → детерминированные правила → null (review-queue).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные операции" }, { status: 400 });
  const d = parsed.data;

  const ctx = await getAccountContext(orgId);
  const currency = ctx?.baseCurrency ?? "EUR";
  const occurredAt = d.dateIso ? new Date(`${d.dateIso}T12:00:00Z`) : new Date();
  const description = d.description || null;

  let category = d.category || null;
  let method: string | null = category ? "user" : null;
  if (!category && d.direction === "expense") {
    category = categorizeByRulesFor(ctx?.type ?? "business", description, "adjustment");
    if (category) method = "rule";
  }

  const signedNet = d.direction === "expense" ? -d.amountCents : d.amountCents;
  const [row] = await sql<{ id: string }[]>`
    insert into transactions
      (org_id, source, external_id, kind, direction,
       gross_cents, fee_cents, net_cents, currency, occurred_at, description, category, category_method)
    values
      (${orgId}, 'manual', ${`manual-${randomUUID()}`}, 'adjustment', ${d.direction},
       ${d.amountCents}, 0, ${signedNet}, ${currency}, ${occurredAt}, ${description}, ${category}, ${method})
    returning id
  `;
  return NextResponse.json({ ok: true, id: row?.id, category });
}

const deleteSchema = z.object({ id: z.string().uuid() });

/**
 * Удаление ручных и импортированных из выписки (CSV) операций.
 * Синхронизируемые источники (Stripe/банк) не трогаем — вернутся при синке.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const deleted = await sql`
    delete from transactions
    where id = ${parsed.data.id} and org_id = ${orgId} and source in ('manual', 'csv')
    returning id
  `;
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Удалять можно ручные и загруженные из выписки операции" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
