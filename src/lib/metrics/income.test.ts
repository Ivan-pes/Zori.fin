import { describe, it, expect } from "vitest";
import { computeIncomeProfile } from "./income";
import type { NormalizedTransaction } from "@/types";

function pay(day: string, gross: number, desc = "Salary Acme"): NormalizedTransaction {
  return {
    id: `${desc}-${day}`, source: "csv", externalId: `${desc}-${day}`, kind: "adjustment",
    direction: "income", grossCents: gross, feeCents: 0, netCents: gross,
    currency: "EUR", occurredAt: new Date(`${day}T00:00:00Z`), description: desc, category: "Income:Salary",
  };
}

describe("computeIncomeProfile", () => {
  it("детектит регулярную зарплату и ближайшую дату выплаты", () => {
    const txns = [pay("2026-04-25", 420000), pay("2026-05-25", 420000), pay("2026-06-25", 420000)];
    const p = computeIncomeProfile(txns, { asOf: new Date("2026-07-07T00:00:00Z") });
    expect(p.sources.length).toBe(1);
    expect(p.recurringIncomeCents).toBeGreaterThan(0);
    expect(p.nextPayday).not.toBeNull();
    // следующая зарплата должна быть после asOf
    expect(p.nextPayday!.getTime()).toBeGreaterThanOrEqual(new Date("2026-07-07T00:00:00Z").getTime());
  });

  it("ждём зарплату в пределах периода → expectedRemaining > 0", () => {
    const txns = [pay("2026-04-25", 420000), pay("2026-05-25", 420000), pay("2026-06-25", 420000)];
    const p = computeIncomeProfile(txns, {
      asOf: new Date("2026-07-07T00:00:00Z"),
      periodEnd: new Date("2026-07-31T00:00:00Z"),
    });
    expect(p.expectedRemainingCents).toBe(420000);
  });

  it("без регулярного дохода — профиль пустой", () => {
    const p = computeIncomeProfile([pay("2026-06-25", 420000)], { asOf: new Date("2026-07-07T00:00:00Z") });
    expect(p.sources.length).toBe(0);
    expect(p.nextPayday).toBeNull();
    expect(p.recurringIncomeCents).toBe(0);
  });
});
