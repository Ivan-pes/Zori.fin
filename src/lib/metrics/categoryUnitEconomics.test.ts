import { describe, it, expect } from "vitest";
import { computeCategoryUnitEconomics } from "./categoryUnitEconomics";

describe("computeCategoryUnitEconomics (§2.12)", () => {
  const totals = new Map([
    ["Реклама и маркетинг", 300000], // €3000
    ["ПО и подписки", 60000], // €600
  ]);

  it("CAC = маркетинг / новых клиентов", () => {
    const r = computeCategoryUnitEconomics({ categoryTotals: totals, newCustomers: 10, activeClients: 40 });
    expect(r.cacCents).toBe(30000); // €300 за клиента
  });

  it("инфраструктура на активного клиента", () => {
    const r = computeCategoryUnitEconomics({ categoryTotals: totals, newCustomers: 10, activeClients: 40 });
    expect(r.infraPerCustomerCents).toBe(1500); // €15 на клиента
  });

  it("LTV/CAC когда известен LTV", () => {
    const r = computeCategoryUnitEconomics({
      categoryTotals: totals,
      newCustomers: 10,
      activeClients: 40,
      ltvCents: 120000, // €1200
    });
    expect(r.ltvToCacRatio).toBe(4); // 1200 / 300 — здоровая экономика
  });

  it("нет новых клиентов → CAC null (без деления на ноль)", () => {
    const r = computeCategoryUnitEconomics({ categoryTotals: totals, newCustomers: 0, activeClients: 40 });
    expect(r.cacCents).toBeNull();
    expect(r.ltvToCacRatio).toBeNull();
  });

  it("нет активных клиентов → инфра-на-клиента null", () => {
    const r = computeCategoryUnitEconomics({ categoryTotals: totals, newCustomers: 5, activeClients: 0 });
    expect(r.infraPerCustomerCents).toBeNull();
  });

  it("отсутствующие категории считаются нулевыми тратами", () => {
    const r = computeCategoryUnitEconomics({ categoryTotals: new Map(), newCustomers: 5, activeClients: 10 });
    expect(r.marketingCents).toBe(0);
    expect(r.cacCents).toBe(0);
  });
});
