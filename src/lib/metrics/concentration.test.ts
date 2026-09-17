import { describe, it, expect } from "vitest";
import { computeConcentration } from "./concentration";

describe("computeConcentration", () => {
  it("считает доли, риск топ-клиента и уровень концентрации", () => {
    const c = computeConcentration([
      { customer: "A", mrrCents: 6000 },
      { customer: "B", mrrCents: 3000 },
      { customer: "C", mrrCents: 1000 },
    ])!;
    expect(c.totalMrrCents).toBe(10000);
    expect(c.customerCount).toBe(3);
    expect(c.topSharePct).toBeCloseTo(60, 1);
    expect(c.top3SharePct).toBeCloseTo(100, 1);
    expect(c.level).toBe("high");
    expect(c.customers[0]!.customer).toBe("A");
  });

  it("распределённая база → низкий риск", () => {
    const c = computeConcentration(
      Array.from({ length: 10 }, (_, i) => ({ customer: `c${i}`, mrrCents: 1000 }))
    )!;
    expect(c.topSharePct).toBeCloseTo(10, 1);
    expect(c.level).toBe("low");
  });

  it("игнорирует нулевые/отрицательные и возвращает null на пустом", () => {
    expect(computeConcentration([])).toBeNull();
    expect(computeConcentration([{ customer: "x", mrrCents: 0 }])).toBeNull();
  });
});
