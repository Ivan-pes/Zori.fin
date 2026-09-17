import { describe, it, expect } from "vitest";
import { detectAnomalies } from "./anomalies";
import type { NormalizedTransaction } from "@/types";

function ex(amount: number, category: string, desc = "x", day = "2026-06-10"): NormalizedTransaction {
  return {
    id: Math.random().toString(36), source: "csv", externalId: "e", kind: "adjustment",
    direction: "expense", grossCents: amount, feeCents: 0, netCents: -amount, currency: "EUR",
    occurredAt: new Date(day), description: desc, category,
  };
}

describe("detectAnomalies (B4)", () => {
  it("помечает нетипично крупную трату в категории", () => {
    const txns = [
      ex(1000, "Реклама"), ex(1100, "Реклама"), ex(900, "Реклама"), ex(1050, "Реклама"),
      ex(12000, "Реклама", "Большой счёт"),
    ];
    const flags = detectAnomalies(txns);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.description).toBe("Большой счёт");
    expect(flags[0]!.category).toBe("Реклама");
    expect(flags[0]!.zScore).toBeGreaterThan(2.5);
  });

  it("не флагует ровные траты", () => {
    const txns = [ex(1000, "Аренда"), ex(1000, "Аренда"), ex(1000, "Аренда"), ex(1000, "Аренда")];
    expect(detectAnomalies(txns)).toHaveLength(0);
  });

  it("игнорирует категории с малой выборкой и доходы", () => {
    const txns = [
      ex(50000, "Разовое"),
      { ...ex(99999, "Реклама"), direction: "income" as const },
    ];
    expect(detectAnomalies(txns)).toHaveLength(0);
  });
});
