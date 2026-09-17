import { describe, it, expect } from "vitest";
import { computeProfitWaterfall } from "./waterfall";
import type { PnL } from "@/types";

const pnl = (p: Partial<PnL>): PnL => ({
  revenueCents: 0, refundCents: 0, netRevenueCents: 0, feeCents: 0,
  expenseCents: 0, totalExpenseCents: 0, profitCents: 0, marginPct: 0, currency: "EUR",
  ...p,
});

describe("computeProfitWaterfall", () => {
  it("раскладывает P&L в ступени с накоплением уровня", () => {
    const steps = computeProfitWaterfall(pnl({ revenueCents: 100000, refundCents: 5000, feeCents: 3000, expenseCents: 42000 }));
    expect(steps.map((s) => s.key)).toEqual(["revenue", "refunds", "fees", "expenses", "profit"]);
    const rev = steps[0]!;
    expect(rev.startCents).toBe(0);
    expect(rev.endCents).toBe(100000);
    const exp = steps[3]!;
    expect(exp.startCents).toBe(92000);   // 100000 − 5000 − 3000
    expect(exp.endCents).toBe(50000);
    const total = steps[4]!;
    expect(total.kind).toBe("total");
    expect(total.endCents).toBe(50000);   // прибыль
    expect(total.startCents).toBe(0);
  });

  it("нулевые вычеты пропускаются, выручка и итог всегда есть", () => {
    const steps = computeProfitWaterfall(pnl({ revenueCents: 50000 }));
    expect(steps.map((s) => s.key)).toEqual(["revenue", "profit"]);
  });

  it("убыток: итоговая ступень уходит в минус", () => {
    const steps = computeProfitWaterfall(pnl({ revenueCents: 10000, expenseCents: 30000 }));
    const total = steps.at(-1)!;
    expect(total.endCents).toBe(-20000);
  });
});
