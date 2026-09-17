import { describe, it, expect } from "vitest";
import { goalProgress } from "./goals";

describe("goalProgress (Цели)", () => {
  it("считает процент и остаток", () => {
    const p = goalProgress({ targetCents: 300000, currentCents: 192000 }, 36000);
    expect(p.pct).toBe(64);
    expect(p.remainingCents).toBe(108000);
    expect(p.done).toBe(false);
  });

  it("ETA по темпу накоплений (в месяцах)", () => {
    const p = goalProgress({ targetCents: 300000, currentCents: 192000 }, 36000, new Date(Date.UTC(2026, 5, 1)));
    expect(p.etaMonths).toBe(3);
    expect(p.etaLabel).toBe("к сентябрю");
  });

  it("длинный срок → ≈ N мес", () => {
    const p = goalProgress({ targetCents: 1350000, currentCents: 510000 }, 50000);
    expect(p.etaMonths).toBe(17);
    expect(p.etaLabel).toBe("≈ 17 мес");
  });

  it("нет профицита → нет оценки ETA", () => {
    const p = goalProgress({ targetCents: 100000, currentCents: 10000 }, 0);
    expect(p.etaMonths).toBeNull();
    expect(p.etaLabel).toBeNull();
  });

  it("цель достигнута", () => {
    const p = goalProgress({ targetCents: 100000, currentCents: 120000 }, 5000);
    expect(p.pct).toBe(100);
    expect(p.done).toBe(true);
    expect(p.remainingCents).toBe(0);
  });
});
