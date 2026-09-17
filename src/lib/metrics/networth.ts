export type AccountKind = "cash" | "bank" | "card" | "savings" | "asset" | "debt";

export interface AccountBalance {
  id: string;
  kind: AccountKind;
  name: string;
  balanceCents: number;   // знаковое: для долга — отрицательное (в валюте счёта, для показа)
  currency: string;
  /** Баланс, приведённый к базовой валюте — для корректных ИТОГОВ при разных валютах.
   *  Если не задан, итоги считаются по balanceCents (одна валюта). */
  baseCents?: number;
}

export interface NetWorth {
  assetsCents: number;
  debtsCents: number;      // положительная величина суммарного долга
  netCents: number;
  byAccount: AccountBalance[];
}

/**
 * Чистый капитал = активы − долги. Долги (kind='debt' или отрицательный баланс)
 * учитываются как обязательства. Детерминированно, без обращения к БД.
 */
export function computeNetWorth(accounts: AccountBalance[]): NetWorth {
  let assetsCents = 0;
  let debtsCents = 0;

  for (const a of accounts) {
    // Итоги считаем в базовой валюте (baseCents), показ — в валюте счёта (balanceCents).
    const forTotal = a.baseCents ?? a.balanceCents;
    const isDebt = a.kind === "debt" || forTotal < 0;
    if (isDebt) debtsCents += Math.abs(forTotal);
    else assetsCents += forTotal;
  }

  return {
    assetsCents,
    debtsCents,
    netCents: assetsCents - debtsCents,
    byAccount: accounts,
  };
}
