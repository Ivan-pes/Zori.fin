import { describe, it, expect } from "vitest";
import { computeMrrMovements, toMonthlyCents, type SubInput } from "./mrr";

function sub(p: Partial<SubInput>): SubInput {
  return {
    amountCents: 1000,
    interval: "month",
    intervalCount: 1,
    status: "active",
    startedAt: new Date("2026-01-01"),
    canceledAt: null,
    customerId: "c" + Math.random(),
    ...p,
  };
}

const FROM = new Date("2026-06-01T00:00:00Z");
const TO = new Date("2026-07-01T00:00:00Z");
const NOW = new Date("2026-06-20T00:00:00Z");

describe("toMonthlyCents", () => {
  it("нормализует год/неделю в месяц", () => {
    expect(toMonthlyCents(12000, "year", 1)).toBe(1000);
    expect(toMonthlyCents(1000, "month", 1)).toBe(1000);
  });
});

describe("computeMrrMovements (B1)", () => {
  it("новая подписка в периоде → New MRR", () => {
    const m = computeMrrMovements([sub({ startedAt: new Date("2026-06-05"), amountCents: 5000 })], FROM, TO, NOW);
    expect(m.newMrrCents).toBe(5000);
    expect(m.newCustomers).toBe(1);
    expect(m.mrrNowCents).toBe(5000);
  });

  it("отменённая в периоде → Churned MRR", () => {
    const m = computeMrrMovements(
      [sub({ startedAt: new Date("2026-01-01"), canceledAt: new Date("2026-06-10"), status: "canceled", amountCents: 3000 })],
      FROM, TO, NOW
    );
    expect(m.churnedMrrCents).toBe(3000);
    expect(m.churnedCustomers).toBe(1);
    expect(m.mrrNowCents).toBe(0);
    expect(m.netNewMrrCents).toBe(-3000);
  });

  it("Quick Ratio = New/Churned; retention учитывает отток когорты", () => {
    const rows = [
      sub({ startedAt: new Date("2026-01-01"), amountCents: 10000 }),
      sub({ startedAt: new Date("2026-01-01"), canceledAt: new Date("2026-06-15"), status: "canceled", amountCents: 5000 }),
      sub({ startedAt: new Date("2026-06-02"), amountCents: 4000 }),
    ];
    const m = computeMrrMovements(rows, FROM, TO, NOW);
    expect(m.newMrrCents).toBe(4000);
    expect(m.churnedMrrCents).toBe(5000);
    expect(m.quickRatio).toBe(0.8);
    expect(m.retentionPct).toBe(66.7);
  });

  it("нет оттока → quickRatio null", () => {
    const m = computeMrrMovements([sub({ startedAt: new Date("2026-06-03"), amountCents: 2000 })], FROM, TO, NOW);
    expect(m.quickRatio).toBeNull();
  });
});
