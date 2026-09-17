import { sql } from "@/lib/db";
import { dedupStatementRows, keyOf, type StatementRow } from "./dedup";

// Вставка операций выписки в БД с дедупликацией против существующих (банк +
// прошлые выписки + ручные). Возвращает сколько добавлено / пропущено.
export async function insertStatementRows(
  orgId: string,
  rows: StatementRow[]
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  // Диапазон дат выписки — грузим существующие операции только за него.
  let min = rows[0]!.dateIso;
  let max = rows[0]!.dateIso;
  for (const r of rows) {
    if (r.dateIso < min) min = r.dateIso;
    if (r.dateIso > max) max = r.dateIso;
  }
  const maxNext = new Date(`${max}T00:00:00Z`);
  maxNext.setUTCDate(maxNext.getUTCDate() + 1);
  const maxNextIso = maxNext.toISOString().slice(0, 10);

  const existingRows = await sql<{ day: string; net_cents: string | number; currency: string; n: number }[]>`
    select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD') as day,
           net_cents, currency, count(*)::int as n
    from transactions
    where org_id = ${orgId} and source in ('gocardless', 'csv', 'manual')
      and occurred_at >= ${min} and occurred_at < ${maxNextIso}
    group by 1, 2, 3
  `;
  const existing = new Map<string, number>();
  for (const e of existingRows) {
    existing.set(keyOf(e.day, Number(e.net_cents), e.currency), e.n);
  }

  const { toInsert, skipped } = dedupStatementRows(rows, existing);
  for (const { row, externalId } of toInsert) {
    await sql`
      insert into transactions
        (org_id, source, external_id, kind, direction,
         gross_cents, fee_cents, net_cents, currency, occurred_at, description)
      values
        (${orgId}, 'csv', ${externalId}, 'adjustment', ${row.cents >= 0 ? "income" : "expense"},
         ${Math.abs(row.cents)}, 0, ${row.cents}, ${row.currency}, ${row.date}, ${row.description})
      on conflict (org_id, source, external_id) do nothing
    `;
  }
  return { imported: toInsert.length, skipped };
}
