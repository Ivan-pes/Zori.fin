import { describe, it, expect } from "vitest";
import { computeVariance } from "./variance";
import type { NormalizedTransaction } from "@/types";

function charge(amount: number): NormalizedTransaction {
  return { id: Math.random().toString(36), source: "stripe", externalId: "e", kind: "charge", direction: "income", grossCents: amount, feeCents: 0, netCents: amount, currency: "EUR", occurredAt: new Date("2026-06-10"), description: null, category: null };
}
function expense(amount: number, category: string): NormalizedTransaction {
  return { id: Math.random().toString(36), source: "csv", externalId: "e", kind: "adjustment", direction: "expense", grossCents: amount, feeCents: 0, netCents: -amount, currency: "EUR", occurredAt: new Date("2026-06-10"), description: null, category };
}

describe("computeVariance (B9)", () => {
  it("считает дельты выручки/прибыли и драйверы по категориям", () => {
    const current = [charge(10000), expense(3000, "Реклама"), expense(1000, "Аренда")];
    const previous = [charge(8000), expense(1000, "Реклама"), expense(1000, "Аренда")];

    const v = computeVariance(current, previous);
    expect(v.revenueDeltaCents).toBe(2000);
    expect(v.profitDeltaCents).toBe(0);
    expect(v.drivers[0]).toEqual({ category: "Реклама", currentCents: 3000, prevCents: 1000, deltaCents: 2000 });
    expect(v.drivers.find((d) => d.category === "Аренда")).toBeUndefined();
  });

  it("маржа: дельта в процентных пунктах", () => {
    const v = computeVariance([charge(10000)], [charge(10000), expense(5000, "X")]);
    expect(v.marginDeltaPct).toBe(50);
  });
});
