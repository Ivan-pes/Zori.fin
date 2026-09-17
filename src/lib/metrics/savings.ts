import type { NormalizedTransaction } from "@/types";
import { computePnL } from "./engine";

export interface Savings {
  incomeCents: number;
  spendingCents: number;
  savedCents: number;
  ratePct: number;
  currency: string;
}

/**
 * Личный аналог P&L: доход − траты = отложено; норма сбережений = saved / income.
 * Тонкая обёртка над computePnL — движок остаётся один.
 */
export function computeSavings(txns: NormalizedTransaction[]): Savings {
  const pnl = computePnL(txns);
  const incomeCents = pnl.netRevenueCents;
  const spendingCents = pnl.totalExpenseCents;
  const savedCents = incomeCents - spendingCents;
  const ratePct = incomeCents > 0 ? (savedCents / incomeCents) * 100 : 0;
  return {
    incomeCents,
    spendingCents,
    savedCents,
    ratePct: Math.round(ratePct * 10) / 10,
    currency: pnl.currency,
  };
}
