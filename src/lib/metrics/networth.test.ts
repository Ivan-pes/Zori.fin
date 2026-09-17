import { describe, it, expect } from "vitest";
import { computeNetWorth, type AccountBalance } from "./networth";

function acc(kind: AccountBalance["kind"], balanceCents: number, name = kind): AccountBalance {
  return { id: `${kind}-${balanceCents}`, kind, name, balanceCents, currency: "EUR" };
}

describe("computeNetWorth", () => {
  it("активы минус долги", () => {
    const nw = computeNetWorth([
      acc("bank", 648000),
      acc("savings", 300000),
      acc("debt", -1200000),   // кредит
    ]);
    expect(nw.assetsCents).toBe(948000);
    expect(nw.debtsCents).toBe(1200000);
    expect(nw.netCents).toBe(948000 - 1200000);
  });

  it("отрицательный баланс любого счёта трактуется как долг", () => {
    const nw = computeNetWorth([acc("card", -50000), acc("cash", 20000)]);
    expect(nw.assetsCents).toBe(20000);
    expect(nw.debtsCents).toBe(50000);
    expect(nw.netCents).toBe(-30000);
  });

  it("пусто — нули", () => {
    expect(computeNetWorth([])).toMatchObject({ assetsCents: 0, debtsCents: 0, netCents: 0 });
  });
});
