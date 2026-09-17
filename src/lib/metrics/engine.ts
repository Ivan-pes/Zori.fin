import type { NormalizedTransaction, Period, PnL } from "@/types";
import { isTransferCategory } from "@/lib/categorize/categories";

export function inPeriod(t: NormalizedTransaction, period: Period): boolean {
  return t.occurredAt >= period.from && t.occurredAt < period.to;
}

export function computePnL(txns: NormalizedTransaction[]): PnL {
  let revenueCents = 0;
  let refundCents = 0;
  let feeCents = 0;
  let expenseCents = 0;
  const currency = txns[0]?.currency ?? "EUR";

  for (const t of txns) {
    feeCents += t.feeCents;
    // Внутренние переводы/инвестиции — не выручка и не траты (§4.5):
    // иначе KPI расходов/дохода раздуваются движениями между своими счетами.
    if (isTransferCategory(t.category)) continue;
    if (t.kind === "charge") revenueCents += t.grossCents;
    else if (t.kind === "refund") refundCents += t.grossCents;
    else if (t.direction === "income" && t.kind !== "fee") {
      revenueCents += t.grossCents;
    } else if (t.direction === "expense" && t.kind !== "fee") {
      expenseCents += t.grossCents;
    }
  }

  const netRevenueCents = revenueCents - refundCents;
  const totalExpenseCents = expenseCents + feeCents;
  const profitCents = netRevenueCents - totalExpenseCents;
  const marginPct =
    netRevenueCents > 0 ? (profitCents / netRevenueCents) * 100 : 0;

  return {
    revenueCents,
    refundCents,
    netRevenueCents,
    feeCents,
    expenseCents,
    totalExpenseCents,
    profitCents,
    marginPct,
    currency,
  };
}

export function expensesByCategory(
  txns: NormalizedTransaction[]
): Array<{ category: string; totalCents: number }> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "expense") continue;
    if (isTransferCategory(t.category)) continue; // переводы — не траты (§4.5)
    const key = t.category ?? "Uncategorized";
    map.set(key, (map.get(key) ?? 0) + t.grossCents);
  }
  return [...map.entries()]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/**
 * Разбивка ДОХОДА по источникам из фактических транзакций (для расшифровки KPI
 * «Доход»). Группируем по описанию (кто заплатил), иначе по категории; переводы
 * между своими счетами исключаем, возвраты вычитаем. Сумма ≈ netRevenueCents.
 */
export function incomeSources(
  txns: NormalizedTransaction[]
): Array<{ description: string | null; category: string | null; totalCents: number }> {
  const map = new Map<string, { description: string | null; category: string | null; totalCents: number }>();
  for (const t of txns) {
    if (isTransferCategory(t.category)) continue; // переводы — не доход (§4.5)
    let cents = 0;
    if (t.kind === "charge") cents = t.grossCents;
    else if (t.kind === "refund") cents = -t.grossCents;
    else if (t.direction === "income" && t.kind !== "fee") cents = t.grossCents;
    else continue;
    if (cents === 0) continue;
    const desc = t.description?.trim() || null;
    const key = desc ? `d:${desc.toLowerCase()}` : `c:${t.category ?? "none"}`;
    const cur = map.get(key);
    if (cur) cur.totalCents += cents;
    else map.set(key, { description: desc, category: t.category ?? null, totalCents: cents });
  }
  return [...map.values()]
    .filter((x) => x.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents);
}

export function expenseBreakdown(
  txns: NormalizedTransaction[]
): Array<{ label: string; totalCents: number }> {
  const pnl = computePnL(txns);
  const lines: Array<{ label: string; totalCents: number }> = [];

  if (pnl.feeCents > 0) {
    lines.push({ label: "Комиссии (Stripe)", totalCents: pnl.feeCents });
  }
  if (pnl.refundCents > 0) {
    lines.push({ label: "Возвраты клиентам", totalCents: pnl.refundCents });
  }
  for (const e of expensesByCategory(txns)) {
    lines.push({ label: e.category, totalCents: e.totalCents });
  }

  return lines.sort((a, b) => b.totalCents - a.totalCents);
}
