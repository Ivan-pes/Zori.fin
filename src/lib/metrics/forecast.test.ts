import { describe, it, expect } from "vitest";
import { forecastCashFlow } from "./forecast";
import type { NormalizedTransaction } from "@/types";

function tx(daysAgo: number, netCents: number): NormalizedTransaction {
  return {
    id: "x",
    source: "stripe",
    externalId: `e${daysAgo}`,
    kind: netCents >= 0 ? "charge" : "adjustment",
    direction: netCents >= 0 ? "income" : "expense",
    grossCents: Math.abs(netCents),
    feeCents: 0,
    netCents,
    currency: "EUR",
    occurredAt: new Date(Date.now() - daysAgo * 86_400_000),
    description: null,
    category: null,
  };
}

describe("forecastCashFlow", () => {
  it("положительный поток — разрыв не прогнозируется", () => {
    const txns = Array.from({ length: 10 }, (_, i) => tx(10 - i, 1000));
    const f = forecastCashFlow(txns, 100000, { horizonDays: 30, lookbackDays: 10 });
    expect(f.avgDailyNetCents).toBe(1000);
    expect(f.gapDate).toBeNull();
    expect(f.endBalanceCents).toBeGreaterThan(f.startingBalanceCents);
    expect(f.endDeltaCents).toBe(30000);
  });

  it("сценарий: регулярное изменение и разовая трата сдвигают прогноз (B3)", () => {
    const txns = Array.from({ length: 10 }, (_, i) => tx(10 - i, 1000));
    const base = forecastCashFlow(txns, 100000, { horizonDays: 30, lookbackDays: 10 });
    const scn = forecastCashFlow(txns, 100000, {
      horizonDays: 30,
      lookbackDays: 10,
      scenario: { monthlyDeltaCents: -300_000, oneOffCents: -100_000 },
    });
    expect(base.endBalanceCents).toBe(130000);
    expect(scn.endBalanceCents).toBe(-270000);
    expect(scn.gapDate).not.toBeNull();
  });

  it("отрицательный поток + низкий остаток — прогнозирует разрыв", () => {
    const txns = Array.from({ length: 10 }, (_, i) => tx(10 - i, -1000));
    const f = forecastCashFlow(txns, 5000, { horizonDays: 30, lookbackDays: 10 });
    expect(f.avgDailyNetCents).toBe(-1000);
    expect(f.gapDate).not.toBeNull();
    expect(f.gapBalanceCents).toBeLessThan(0);
  });

  it("учитывает безопасный порог (не только ноль)", () => {
    const txns = Array.from({ length: 10 }, (_, i) => tx(10 - i, -100));
    const f = forecastCashFlow(txns, 5000, { horizonDays: 30, lookbackDays: 10, thresholdCents: 4000 });
    expect(f.gapDate).not.toBeNull();
  });

  it("дневной темп считается по окну, а не по размеру истории", () => {
    const f = forecastCashFlow([tx(1, 30000)], 0, { lookbackDays: 30 });
    expect(f.avgDailyNetCents).toBe(1000);
  });

  it("длина прогноза равна горизонту", () => {
    const f = forecastCashFlow([tx(1, 500)], 5000, { horizonDays: 14 });
    expect(f.points.filter((p) => p.kind === "forecast").length).toBe(14);
  });
});
