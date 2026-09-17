import { csvExternalId } from "@/lib/csv/normalize";

// Дедупликация операций выписки против уже имеющихся (из банка или прошлых
// выписок). Иван: подключил банк (даёт ~90 дней), а за более ранний период
// грузит выписку — сервис должен сам понять, какие операции уже есть, и
// добавить только НОВЫЕ. Сопоставляем по мультимножеству «день + сумма +
// валюта»: описания у банка и выписки разные, поэтому по описанию не сверяем,
// но считаем КОЛИЧЕСТВО — два одинаковых кофе в день не схлопнутся в одно.

export interface StatementRow {
  date: Date;
  dateIso: string; // YYYY-MM-DD (UTC)
  cents: number; // знаковое: расход < 0
  currency: string; // ISO, upper-case
  description: string | null;
}

export interface DedupResult {
  toInsert: { row: StatementRow; externalId: string }[];
  skipped: number;
}

export function keyOf(dateIso: string, cents: number, currency: string): string {
  return `${dateIso}|${cents}|${currency}`;
}

// Чистая дедупликация (без БД) — тестируемая. existingCounts: сколько операций
// с данным ключом уже есть. Каждая строка выписки «гасит» одну существующую
// (skip); что не погашено — на вставку, с уникальным external_id (одинаковые
// внутри файла разводим суффиксом #n, как в банковском маппинге).
export function dedupStatementRows(
  rows: StatementRow[],
  existingCounts: Map<string, number>
): DedupResult {
  const remaining = new Map(existingCounts);
  const seen = new Map<string, number>();
  const toInsert: { row: StatementRow; externalId: string }[] = [];
  let skipped = 0;

  for (const r of rows) {
    const key = keyOf(r.dateIso, r.cents, r.currency);
    const have = remaining.get(key) ?? 0;
    if (have > 0) {
      remaining.set(key, have - 1); // уже покрыта банком/прошлой выпиской
      skipped++;
      continue;
    }
    const base = csvExternalId(r.dateIso, r.cents, r.description ?? "");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    toInsert.push({ row: r, externalId: n === 0 ? base : `${base}#${n}` });
  }
  return { toInsert, skipped };
}
