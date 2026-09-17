import { describe, it, expect } from "vitest";
import { computeBudgetProgress } from "./targets";

describe("computeBudgetProgress", () => {
  it("считает выполнение и прогноз для выручки", () => {
    const p = computeBudgetProgress("revenue", 12000, 5000, 10, 30);
    expect(p.pct).toBeCloseTo(41.7, 1);
    expect(p.projectedCents).toBe(15000);
    expect(p.onTrack).toBe(true);
  });

  it("для расходов «в цели» = не превысить бюджет", () => {
    const p = computeBudgetProgress("expense", 10000, 7000, 15, 30);
    expect(p.projectedCents).toBe(14000);
    expect(p.onTrack).toBe(false);

    const ok = computeBudgetProgress("expense", 10000, 3000, 15, 30);
    expect(ok.onTrack).toBe(true);
  });

  it("не делит на ноль при нулевой цели", () => {
    const p = computeBudgetProgress("profit", 0, 5000, 10, 30);
    expect(p.pct).toBe(0);
    expect(p.projectedPct).toBe(0);
  });
});
