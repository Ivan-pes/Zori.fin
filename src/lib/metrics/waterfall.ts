import type { PnL } from "@/types";

export interface WaterfallStep {
  key: "revenue" | "refunds" | "fees" | "expenses" | "profit";
  deltaCents: number;   // подписанное изменение (приход +, вычет −); для profit — итог
  startCents: number;   // накопленный уровень до шага
  endCents: number;     // накопленный уровень после шага
  kind: "in" | "out" | "total";
}

/**
 * Водопад прибыли месяца: выручка → возвраты → комиссии → расходы → прибыль.
 * Детерминированная раскладка P&L в ступени для графика; нулевые вычеты
 * пропускаются (короче и чище), выручка и итог показываются всегда.
 */
export function computeProfitWaterfall(pnl: PnL): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let level = 0;

  const push = (key: WaterfallStep["key"], delta: number, kind: WaterfallStep["kind"]) => {
    steps.push({ key, deltaCents: delta, startCents: level, endCents: level + delta, kind });
    level += delta;
  };

  push("revenue", pnl.revenueCents, "in");
  if (pnl.refundCents > 0) push("refunds", -pnl.refundCents, "out");
  if (pnl.feeCents > 0) push("fees", -pnl.feeCents, "out");
  if (pnl.expenseCents > 0) push("expenses", -pnl.expenseCents, "out");

  // Итоговая ступень — от нуля до прибыли (уровень к этому моменту = profit).
  steps.push({ key: "profit", deltaCents: level, startCents: 0, endCents: level, kind: "total" });
  return steps;
}
