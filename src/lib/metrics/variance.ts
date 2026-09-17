import type { NormalizedTransaction } from "@/types";
import { computePnL, expensesByCategory } from "./engine";

export interface CategoryDelta {
  category: string;
  currentCents: number;
  prevCents: number;
  deltaCents: number;
}

export interface Variance {
  currency: string;
  revenueDeltaCents: number;
  profitDeltaCents: number;
  marginDeltaPct: number;
  current: { revenueCents: number; profitCents: number; marginPct: number };
  previous: { revenueCents: number; profitCents: number; marginPct: number };
  drivers: CategoryDelta[];
}

export function computeVariance(
  currentTxns: NormalizedTransaction[],
  prevTxns: NormalizedTransaction[]
): Variance {
  const cur = computePnL(currentTxns);
  const prev = computePnL(prevTxns);

  const curCats = new Map(expensesByCategory(currentTxns).map((c) => [c.category, c.totalCents]));
  const prevCats = new Map(expensesByCategory(prevTxns).map((c) => [c.category, c.totalCents]));
  const allCats = new Set([...curCats.keys(), ...prevCats.keys()]);

  const drivers: CategoryDelta[] = [...allCats]
    .map((category) => {
      const currentCents = curCats.get(category) ?? 0;
      const prevCents = prevCats.get(category) ?? 0;
      return { category, currentCents, prevCents, deltaCents: currentCents - prevCents };
    })
    .filter((d) => d.deltaCents !== 0)
    .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));

  return {
    currency: cur.currency,
    revenueDeltaCents: cur.netRevenueCents - prev.netRevenueCents,
    profitDeltaCents: cur.profitCents - prev.profitCents,
    marginDeltaPct: Math.round((cur.marginPct - prev.marginPct) * 10) / 10,
    current: { revenueCents: cur.netRevenueCents, profitCents: cur.profitCents, marginPct: cur.marginPct },
    previous: { revenueCents: prev.netRevenueCents, profitCents: prev.profitCents, marginPct: prev.marginPct },
    drivers,
  };
}
