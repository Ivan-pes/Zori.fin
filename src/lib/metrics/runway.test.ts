import { describe, it, expect } from "vitest";
import { computeRunway } from "./runway";
import { estimateTaxReserve } from "./tax";

describe("computeRunway (B2)", () => {
  it("прибыльный бизнес → бесконечный runway", () => {
    const r = computeRunway(500000, 100);
    expect(r.profitable).toBe(true);
    expect(r.runwayMonths).toBeNull();
    expect(r.burnRateCents).toBe(0);
    expect(r.monthlyNetCents).toBe(3000);
  });

  it("прожигание → месяцев до нуля", () => {
    const r = computeRunway(90000, -1000, new Date("2026-06-01T00:00:00Z"));
    expect(r.profitable).toBe(false);
    expect(r.burnRateCents).toBe(30000);
    expect(r.runwayMonths).toBe(3);
    expect(r.runoutDate).toBe("2026-08-30");
  });

  it("нет денег при прожигании → 0 месяцев", () => {
    const r = computeRunway(0, -500);
    expect(r.runwayMonths).toBe(0);
  });
});

describe("estimateTaxReserve (B7)", () => {
  it("процент от выручки", () => {
    expect(estimateTaxReserve(100000, 20)).toBe(20000);
  });
  it("ставка 0 или нет выручки → 0", () => {
    expect(estimateTaxReserve(100000, 0)).toBe(0);
    expect(estimateTaxReserve(0, 20)).toBe(0);
  });
});
