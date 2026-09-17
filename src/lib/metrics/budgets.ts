import type { NormalizedTransaction } from "@/types";

export type BudgetPace = "under" | "ontrack" | "over";

export interface BudgetLimit {
  category: string;
  limitCents: number;
}

export interface BudgetLine {
  category: string;
  limitCents: number;
  spentCents: number;
  plannedCents: number;      // запланировано в календаре до конца месяца
  remainingCents: number;    // лимит − потрачено − запланировано
  pct: number;               // (потрачено + план) / лимит, %
  pace: BudgetPace;          // темп относительно дня месяца
}

/**
 * Факт по категориям за месяц для КОНВЕРТОВ. В отличие от аналитики трат,
 * переводы/накопления здесь СЧИТАЮТСЯ: конверт «Накопления/Перевод» — это цель
 * («отложить 300 €/мес»), и сделанный перевод её заполняет. В общие траты
 * (PnL/категории/сигналы) переводы по-прежнему не входят (§4.5).
 */
export function spentByCategory(txns: NormalizedTransaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "expense" || t.kind === "fee") continue;
    const cat = t.category ?? "Прочее";
    map.set(cat, (map.get(cat) ?? 0) + t.grossCents);
  }
  return map;
}

/**
 * Статус бюджетов-конвертов. Детерминированно.
 * pace: сравнение факта с «сколько должно быть потрачено к этому дню месяца»
 * при равномерном темпе (linear pacing). Порог ±8%.
 * Плановые траты из календаря (plannedByCategory) резервируют деньги конверта:
 * входят в прогресс/остаток и могут дать «over» заранее.
 */
export function computeBudgetStatus(
  limits: BudgetLimit[],
  txns: NormalizedTransaction[],
  opts: { dayOfMonth: number; daysInMonth: number; plannedByCategory?: Map<string, number> }
): BudgetLine[] {
  const spent = spentByCategory(txns);
  const elapsed = Math.min(1, Math.max(0, opts.dayOfMonth / opts.daysInMonth));

  return limits.map((b) => {
    const spentCents = spent.get(b.category) ?? 0;
    const plannedCents = opts.plannedByCategory?.get(b.category) ?? 0;
    const committed = spentCents + plannedCents;
    const remainingCents = b.limitCents - committed;
    const pct = b.limitCents > 0 ? Math.round((committed / b.limitCents) * 100) : 0;

    const expectedCents = b.limitCents * elapsed;
    let pace: BudgetPace = "ontrack";
    if (committed > b.limitCents) pace = "over";
    else if (spentCents > expectedCents * 1.08) pace = "over";
    else if (spentCents < expectedCents * 0.92) pace = "under";

    return { category: b.category, limitCents: b.limitCents, spentCents, plannedCents, remainingCents, pct, pace };
  });
}
