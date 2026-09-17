import { describe, it, expect } from "vitest";
import { topVendors } from "./vendors";
import type { NormalizedTransaction } from "@/types";

function txn(p: Partial<NormalizedTransaction>): NormalizedTransaction {
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
    occurredAt: new Date("2026-06-10"),
    description: null,
    category: null,
    ...p,
  };
}

describe("topVendors", () => {
  it("группирует расходы по мерчанту, считает долю и сортирует по сумме", () => {
    const v = topVendors([
      txn({ description: "AWS Cloud", grossCents: 6000 }),
      txn({ description: "AWS Cloud invoice 22", grossCents: 4000 }),
      txn({ description: "Notion Labs", grossCents: 1000 }),
      txn({ description: "доход", direction: "income", grossCents: 99999 }),
    ]);
    expect(v[0]!.vendor).toContain("AWS");
    expect(v[0]!.totalCents).toBe(10000);
    expect(v[0]!.count).toBe(2);
    expect(v[0]!.sharePct).toBeCloseTo(90.9, 1);
    expect(v[1]!.totalCents).toBe(1000);
  });

  it("считает изменение к прошлому периоду и помечает новых вендоров", () => {
    const cur = [
      txn({ description: "AWS", grossCents: 12000 }),
      txn({ description: "Figma", grossCents: 3000 }),
    ];
    const prev = [txn({ description: "AWS", grossCents: 10000 })];
    const v = topVendors(cur, prev);
    const aws = v.find((x) => x.vendor.includes("AWS"))!;
    const figma = v.find((x) => x.vendor.includes("Figma"))!;
    expect(aws.deltaPct).toBeCloseTo(20, 1);
    expect(aws.isNew).toBe(false);
    expect(figma.isNew).toBe(true);
    expect(figma.deltaPct).toBeNull();
  });

  it("игнорирует доходы и пустые описания", () => {
    const v = topVendors([
      txn({ description: null, grossCents: 5000 }),
      txn({ description: "доход", direction: "income", grossCents: 5000 }),
    ]);
    expect(v).toHaveLength(0);
  });
});
