import { describe, it, expect } from "vitest";
import { computeSavings } from "./savings";
import type { NormalizedTransaction } from "@/types";

function tx(gross: number, dir: "income" | "expense", desc = "X"): NormalizedTransaction {
  return {
    id: `${desc}-${gross}`, source: "csv", externalId: `${desc}-${gross}`, kind: "adjustment",
    direction: dir, grossCents: gross, feeCents: 0, netCents: dir === "income" ? gross : -gross,
    currency: "EUR", occurredAt: new Date(Date.UTC(2026, 6, 1)), description: desc, category: null,
  };
}

describe("computeSavings", () => {
  it("считает доход, траты, отложено и норму сбережений", () => {
    const s = computeSavings([tx(420000, "income", "Зарплата"), tx(90000, "expense", "Аренда"), tx(30000, "expense", "Еда")]);
    expect(s.incomeCents).toBe(420000);
    expect(s.spendingCents).toBe(120000);
    expect(s.savedCents).toBe(300000);
    expect(s.ratePct).toBeCloseTo(71.4, 1);
  });

  it("при нулевом доходе норма сбережений = 0 (без деления на ноль)", () => {
    const s = computeSavings([tx(5000, "expense")]);
    expect(s.incomeCents).toBe(0);
    expect(s.savedCents).toBe(-5000);
    expect(s.ratePct).toBe(0);
  });

  it("пустой список — все нули", () => {
    const s = computeSavings([]);
    expect(s).toMatchObject({ incomeCents: 0, spendingCents: 0, savedCents: 0, ratePct: 0 });
  });
});
