// Преобразование сырых операций YAXI (docs: transactions.html) в строки для
// вставки. Тут живут две неочевидные, но важные вещи — их легко сломать, и
// потому они покрыты тестами (transactions.test.ts):
//
// 1. УНИКАЛЬНОСТЬ. У карточных операций (Revolut и др.) часто НЕТ endToEndId,
//    и тогда ключ строится из даты+суммы+описания. Два одинаковых платежа в
//    один день (два кофе по 3.50, две поездки) дают ОДИН ключ → второй молча
//    отбрасывался `on conflict do nothing`, и до Zori доезжала лишь часть
//    операций. Разводим их суффиксом #1, #2… по счётчику одинаковых ключей.
//
// 2. ПОРЯДОК. bookingDate — это только дата, без времени, поэтому все операции
//    одного дня схлопывались в 00:00 и внутри дня шли как попало. Банк отдаёт
//    их новыми→старыми; сохраняем этот порядок, раздвигая время в пределах дня
//    на СЕКУНДЫ от полуночи UTC (свежайшая — с наибольшим сдвигом). Секунды, а
//    не часы, — чтобы в любом часовом поясе операция осталась в своём дне.

export interface YxAmount {
  amount?: string | number;
  currency?: string;
}

export interface YxTransaction {
  bookingDate?: string;
  valueDate?: string;
  status?: string;
  endToEndId?: string;
  amount?: YxAmount;
  creditor?: { name?: string; iban?: string };
  debtor?: { name?: string; iban?: string };
  remittanceInformation?: string[];
}

export interface TxRow {
  externalId: string;
  direction: "income" | "expense";
  grossCents: number; // модуль суммы
  netCents: number; // со знаком (расход < 0)
  currency: string;
  occurredAt: Date;
  description: string | null;
  raw: YxTransaction;
}

export function describe(t: YxTransaction): string | null {
  return t.remittanceInformation?.join(" ").trim() || t.creditor?.name || t.debtor?.name || null;
}

export function toCents(amount: string | number | undefined): number | null {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function baseExternalId(t: YxTransaction, cents: number): string {
  if (t.endToEndId) return `yaxi:${t.endToEndId}`;
  const date = t.bookingDate ?? t.valueDate ?? "";
  return `yaxi:${date}:${cents}:${(describe(t) ?? "").slice(0, 40)}`;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayKey(t: YxTransaction): string {
  const raw = (t.bookingDate ?? t.valueDate ?? "").slice(0, 10);
  return DAY_RE.test(raw) ? raw : "";
}

// Полночь дня в UTC + offset секунд. offset мал (число операций дня), поэтому
// время остаётся в пределах тех же суток в любом часовом поясе.
function dayWithOffset(day: string, offsetSec: number): Date {
  if (!day) return new Date();
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + offsetSec * 1000);
}

export function buildTransactionRows(txns: YxTransaction[]): TxRow[] {
  // Проход 1: отбираем только booked с валидной суммой и считаем, сколько
  // операций в каждом дне (нужно, чтобы свежайшую поставить выше остальных).
  const prepared: { t: YxTransaction; cents: number; day: string }[] = [];
  const dayTotals = new Map<string, number>();
  for (const t of txns) {
    if (t.status && t.status.toLowerCase() !== "booked") continue;
    const cents = toCents(t.amount?.amount);
    if (cents === null) continue;
    const day = dayKey(t);
    if (!day) continue; // без валидной даты не добавляем — лучше пропустить, чем поставить «сегодня»
    prepared.push({ t, cents, day });
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + 1);
  }

  // Проход 2: раздаём время (порядок в дне) и уникальные external_id.
  const rows: TxRow[] = [];
  const dayPos = new Map<string, number>();
  const idCount = new Map<string, number>();
  for (const { t, cents, day } of prepared) {
    const pos = dayPos.get(day) ?? 0;
    dayPos.set(day, pos + 1);
    // Банк отдаёт новые→старые: первая операция дня (pos 0) — самая свежая,
    // ей достаётся наибольший сдвиг, чтобы при сортировке она была выше.
    const total = dayTotals.get(day) ?? 1;
    const occurredAt = dayWithOffset(day, total - 1 - pos);

    const base = baseExternalId(t, cents);
    const n = idCount.get(base) ?? 0;
    idCount.set(base, n + 1);

    rows.push({
      externalId: n === 0 ? base : `${base}#${n}`,
      direction: cents >= 0 ? "income" : "expense",
      grossCents: Math.abs(cents),
      netCents: cents,
      currency: (t.amount?.currency ?? "EUR").toUpperCase(),
      occurredAt,
      description: describe(t),
      raw: t,
    });
  }
  return rows;
}
