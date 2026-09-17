import { describe, it, expect } from "vitest";
import { computeAffordability } from "./affordability";

describe("computeAffordability (калькулятор «что могу позволить»)", () => {
  it("небольшой ежемесячный расход при плюсовом потоке → можешь позволить", () => {
    const r = computeAffordability({ amountCents: 45000, recurring: true, avgDailyNetCents: 1600, balanceCents: 900000, thresholdCents: 400000 });
    expect(r.newDailyFlowCents).toBe(100);
    expect(r.verdict).toBe("ok");
    expect(r.newRunwayMonths).toBeNull();
  });

  it("крупный ежемесячный расход уводит поток в минус с коротким runway → рискованно", () => {
    const r = computeAffordability({ amountCents: 150000, recurring: true, avgDailyNetCents: 1600, balanceCents: 500000, thresholdCents: 400000 });
    expect(r.newDailyFlowCents).toBeLessThan(0);
    expect(r.verdict).toBe("risk");
  });

  it("разовый расход ниже порога остатка → рискованно", () => {
    const r = computeAffordability({ amountCents: 300000, recurring: false, avgDailyNetCents: 1600, balanceCents: 500000, thresholdCents: 400000 });
    expect(r.verdict).toBe("risk");
  });

  it("разовый расход в пределах запаса → можешь позволить", () => {
    const r = computeAffordability({ amountCents: 50000, recurring: false, avgDailyNetCents: 1600, balanceCents: 900000, thresholdCents: 400000 });
    expect(r.verdict).toBe("ok");
    expect(r.newDailyFlowCents).toBe(1600);
  });
});
