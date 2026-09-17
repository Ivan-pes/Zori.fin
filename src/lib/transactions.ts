import { sql } from "./db";
import type { NormalizedTransaction, Period, TransactionSource } from "@/types";
import { getRates, convertCents } from "./fx";

interface Row {
  id: string;
  source: TransactionSource;
  external_id: string;
  kind: NormalizedTransaction["kind"];
  direction: NormalizedTransaction["direction"];
  gross_cents: string;
  fee_cents: string;
  net_cents: string;
  currency: string;
  occurred_at: Date;
  description: string | null;
  category: string | null;
  member_id?: string | null;
}

function toDomain(r: Row): NormalizedTransaction {
  return {
    id: r.id,
    source: r.source,
    externalId: r.external_id,
    kind: r.kind,
    direction: r.direction,
    grossCents: Number(r.gross_cents),
    feeCents: Number(r.fee_cents),
    netCents: Number(r.net_cents),
    currency: r.currency,
    occurredAt: r.occurred_at,
    description: r.description,
    category: r.category,
    memberId: r.member_id ?? null,
  };
}

export async function getBaseCurrency(orgId: string): Promise<string> {
  const [row] = await sql<{ base_currency: string | null }[]>`
    select base_currency from organizations where id = ${orgId}
  `;
  return (row?.base_currency ?? "EUR").toUpperCase();
}

export async function toBaseCurrency(
  txns: NormalizedTransaction[],
  base: string
): Promise<NormalizedTransaction[]> {
  if (txns.length === 0) return txns;
  const baseCur = base.toUpperCase();
  if (txns.every((t) => (t.currency || "EUR").toUpperCase() === baseCur)) {
    return txns;
  }
  const rates = await getRates();
  return txns.map((t) => {
    const from = (t.currency || "EUR").toUpperCase();
    if (from === baseCur) return t;
    return {
      ...t,
      grossCents: convertCents(t.grossCents, from, baseCur, rates),
      feeCents: convertCents(t.feeCents, from, baseCur, rates),
      netCents: convertCents(t.netCents, from, baseCur, rates),
      currency: baseCur,
      origCurrency: from,
      origGrossCents: t.grossCents,
    };
  });
}

export async function loadTransactions(
  orgId: string,
  period: Period
): Promise<NormalizedTransaction[]> {
  const rows = await sql<Row[]>`
    select * from transactions
    where org_id = ${orgId}
      and occurred_at >= ${period.from}
      and occurred_at <  ${period.to}
    order by occurred_at asc
  `;
  return toBaseCurrency(rows.map(toDomain), await getBaseCurrency(orgId));
}

export async function loadRecentTransactions(
  orgId: string,
  limit = 6
): Promise<NormalizedTransaction[]> {
  const rows = await sql<Row[]>`
    select * from transactions
    where org_id = ${orgId}
    order by occurred_at desc
    limit ${limit}
  `;
  return toBaseCurrency(rows.map(toDomain), await getBaseCurrency(orgId));
}
