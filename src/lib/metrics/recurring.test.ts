import { describe, it, expect } from "vitest";
import { detectRecurring, merchantKey, recurringMonthlyTotal, findDuplicateCharges } from "./recurring";
import type { NormalizedTransaction } from "@/types";

function tx(p: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    id: Math.random().toString(36),
    source: "csv",
    externalId: "e",
    kind: "adjustment",
    direction: "expense",
    grossCents: 0,
    feeCents: 0,
    netCents: 0,
    currency: "EUR",
    occurredAt: new Date("2026-01-01"),
    description: null,
    category: null,
    ...p,
  };
}

function series(desc: string, startISO: string, stepDays: number, n: number, cents: number) {
  const start = new Date(startISO).getTime();
  return Array.from({ length: n }, (_, i) =>
    tx({ description: desc, grossCents: cents, occurredAt: new Date(start + i * stepDays * 86_400_000) })
  );
}

describe("merchantKey", () => {
  it("нормализует описание в ключ мерчанта", () => {
    expect(merchantKey("Claude.ai")).toBe("claude ai");
    expect(merchantKey("www.1global.com/*London")).toBe("global com");
    expect(merchantKey("Mercadona Av.ramon Y Caja, Tenerife")).toBe("mercadona av");
  });
});

describe("detectRecurring", () => {
  it("ловит месячную подписку (≥3 повторов)", () => {
    const r = detectRecurring(series("Claude.ai", "2026-01-05", 30, 4, 2000));
    expect(r).toHaveLength(1);
    expect(r[0]!.cadence).toBe("monthly");
    expect(r[0]!.count).toBe(4);
    expect(r[0]!.avgAmountCents).toBe(2000);
    expect(r[0]!.monthlyEstimateCents).toBe(2000);
  });

  it("ловит недельную трату и оценивает месячную нагрузку", () => {
    const r = detectRecurring(series("Coffee Bar", "2026-01-01", 7, 5, 300));
    expect(r).toHaveLength(1);
    expect(r[0]!.cadence).toBe("weekly");
    expect(r[0]!.monthlyEstimateCents).toBe(Math.round(300 * 4.33));
  });

  it("игнорирует разовые и нерегулярные траты", () => {
    const txns = [
      ...series("Subscription", "2026-01-10", 30, 3, 999),
      tx({ description: "One-off shop", grossCents: 5000, occurredAt: new Date("2026-02-02") }),
      tx({ description: "Random", grossCents: 100, occurredAt: new Date("2026-03-15") }),
    ];
    const r = detectRecurring(txns);
    expect(r.map((x) => x.cadence)).toEqual(["monthly"]);
  });

  it("не считает доходы", () => {
    const inc = series("Payroll In", "2026-01-01", 30, 4, 100000).map((t) => ({ ...t, direction: "income" as const }));
    expect(detectRecurring(inc)).toHaveLength(0);
  });

  it("recurringMonthlyTotal суммирует оценки", () => {
    const r = detectRecurring([
      ...series("A sub", "2026-01-01", 30, 3, 1000),
      ...series("B sub", "2026-01-01", 30, 3, 2000),
    ]);
    expect(recurringMonthlyTotal(r)).toBe(3000);
  });

  it("помечает забытую/отменённую подписку (давно не списывалась)", () => {
    const r = detectRecurring(series("Old Sub", "2026-01-05", 30, 3, 1500), {
      asOf: new Date("2026-06-28").getTime(),
    });
    expect(r[0]!.stale).toBe(true);
    expect(r[0]!.daysSinceLast).toBeGreaterThan(90);
  });
});

describe("findDuplicateCharges", () => {
  it("ловит двойное списание (та же сумма и мерчант в пределах нескольких дней)", () => {
    const dups = findDuplicateCharges([
      tx({ description: "Netflix", grossCents: 1599, occurredAt: new Date("2026-06-01") }),
      tx({ description: "Netflix", grossCents: 1599, occurredAt: new Date("2026-06-02") }),
      tx({ description: "Shop", grossCents: 5000, occurredAt: new Date("2026-06-10") }),
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0]!.count).toBe(2);
    expect(dups[0]!.amountCents).toBe(1599);
  });

  it("не считает дублем повтор подписки через месяц", () => {
    const dups = findDuplicateCharges([
      tx({ description: "Spotify", grossCents: 999, occurredAt: new Date("2026-05-01") }),
      tx({ description: "Spotify", grossCents: 999, occurredAt: new Date("2026-06-01") }),
    ]);
    expect(dups).toHaveLength(0);
  });
});
