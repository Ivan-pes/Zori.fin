import { describe, it, expect } from "vitest";
import {
  computePnL,
  expensesByCategory,
  expenseBreakdown,
  incomeSources,
  inPeriod,
} from "./engine";
import type { NormalizedTransaction } from "@/types";

function txn(p: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    id: "x",
    source: "stripe",
    externalId: "e",
    kind: "charge",
    direction: "income",
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

describe("computePnL", () => {
  it("считает выручку, комиссии, прибыль и маржу", () => {
    const p = computePnL([
      txn({ kind: "charge", grossCents: 10000, feeCents: 300 }),
      txn({ kind: "charge", grossCents: 5000, feeCents: 150 }),
    ]);
    expect(p.revenueCents).toBe(15000);
    expect(p.feeCents).toBe(450);
    expect(p.totalExpenseCents).toBe(450);
    expect(p.profitCents).toBe(14550);
    expect(p.marginPct).toBeCloseTo(97, 1);
    expect(p.currency).toBe("EUR");
  });

  it("вычитает возвраты из выручки", () => {
    const p = computePnL([
      txn({ kind: "charge", grossCents: 10000 }),
      txn({ kind: "refund", direction: "expense", grossCents: 2000 }),
    ]);
    expect(p.revenueCents).toBe(10000);
    expect(p.refundCents).toBe(2000);
    expect(p.netRevenueCents).toBe(8000);
  });

  it("учитывает прочие расходы (кроме комиссий)", () => {
    const p = computePnL([
      txn({ kind: "charge", grossCents: 10000 }),
      txn({ kind: "adjustment", direction: "expense", grossCents: 3000 }),
    ]);
    expect(p.expenseCents).toBe(3000);
    expect(p.profitCents).toBe(7000);
  });

  it("банковские поступления (adjustment, income) считаются выручкой", () => {
    const p = computePnL([
      txn({ source: "csv", kind: "adjustment", direction: "income", grossCents: 4533 }),
      txn({ source: "csv", kind: "adjustment", direction: "expense", grossCents: 2935 }),
    ]);
    expect(p.revenueCents).toBe(4533);
    expect(p.expenseCents).toBe(2935);
    expect(p.profitCents).toBe(1598);
  });

  it("внутренние переводы не считаются ни тратами, ни выручкой (§4.5)", () => {
    const pnl = computePnL([
      txn({ grossCents: 100000 }), // выручка
      txn({ kind: "adjustment", direction: "expense", grossCents: 30000, category: "Реклама и маркетинг" }),
      txn({ kind: "adjustment", direction: "expense", grossCents: 80000, category: "Переводы" }),
      txn({ kind: "adjustment", direction: "expense", grossCents: 50000, category: "Накопления/Перевод" }),
      txn({ kind: "adjustment", direction: "income", grossCents: 20000, category: "Переводы" }),
    ]);
    expect(pnl.expenseCents).toBe(30000);   // только реклама
    expect(pnl.revenueCents).toBe(100000);  // пополнение с инвестсчёта — не выручка
  });

  it("возвращает нули на пустом наборе и не делит на ноль", () => {
    const empty = computePnL([]);
    expect(empty.revenueCents).toBe(0);
    expect(empty.profitCents).toBe(0);
    expect(empty.marginPct).toBe(0);

    const onlyExpense = computePnL([
      txn({ kind: "adjustment", direction: "expense", grossCents: 1000 }),
    ]);
    expect(onlyExpense.marginPct).toBe(0);
  });
});

describe("expensesByCategory", () => {
  it("группирует расходы по категориям и сортирует по убыванию", () => {
    const r = expensesByCategory([
      txn({ direction: "expense", grossCents: 1000, category: "Реклама" }),
      txn({ direction: "expense", grossCents: 3000, category: "Аренда" }),
      txn({ direction: "expense", grossCents: 500, category: "Реклама" }),
      txn({ direction: "income", grossCents: 9999 }),
    ]);
    expect(r).toEqual([
      { category: "Аренда", totalCents: 3000 },
      { category: "Реклама", totalCents: 1500 },
    ]);
  });

  it("расход без категории попадает в Uncategorized", () => {
    const r = expensesByCategory([
      txn({ direction: "expense", grossCents: 100, category: null }),
    ]);
    expect(r[0]).toEqual({ category: "Uncategorized", totalCents: 100 });
  });
});

describe("expenseBreakdown", () => {
  it("добавляет комиссии отдельной строкой и сортирует по убыванию", () => {
    const r = expenseBreakdown([
      txn({ kind: "charge", grossCents: 10000, feeCents: 250 }),
      txn({ kind: "adjustment", direction: "expense", grossCents: 3000, category: "Аренда" }),
    ]);
    expect(r[0]).toEqual({ label: "Аренда", totalCents: 3000 });
    expect(r).toContainEqual({ label: "Комиссии (Stripe)", totalCents: 250 });
  });
});

describe("incomeSources", () => {
  it("группирует доход по описанию (кто заплатил) и сортирует по убыванию", () => {
    const r = incomeSources([
      txn({ kind: "adjustment", direction: "income", grossCents: 250000, description: "Зарплата ACME" }),
      txn({ kind: "adjustment", direction: "income", grossCents: 30000, description: "Фриланс" }),
      txn({ kind: "adjustment", direction: "income", grossCents: 12000, description: "Фриланс" }),
    ]);
    expect(r).toEqual([
      { description: "Зарплата ACME", category: null, totalCents: 250000 },
      { description: "Фриланс", category: null, totalCents: 42000 },
    ]);
  });

  it("без описания группирует по категории", () => {
    const r = incomeSources([
      txn({ kind: "adjustment", direction: "income", grossCents: 5000, description: null, category: "Salary/Income" }),
      txn({ kind: "adjustment", direction: "income", grossCents: 1000, description: null, category: "Salary/Income" }),
    ]);
    expect(r).toEqual([{ description: null, category: "Salary/Income", totalCents: 6000 }]);
  });

  it("исключает переводы между своими счетами и вычитает возвраты", () => {
    const r = incomeSources([
      txn({ kind: "adjustment", direction: "income", grossCents: 100000, description: "Зарплата" }),
      txn({ kind: "adjustment", direction: "income", grossCents: 80000, category: "Переводы" }),
      txn({ kind: "refund", direction: "expense", grossCents: 5000, description: "Зарплата" }),
    ]);
    expect(r).toEqual([{ description: "Зарплата", category: null, totalCents: 95000 }]);
  });

  it("сумма разбивки совпадает с netRevenueCents из computePnL", () => {
    const txns = [
      txn({ kind: "adjustment", direction: "income", grossCents: 250000, description: "Зарплата" }),
      txn({ kind: "adjustment", direction: "income", grossCents: 34000, description: "Кэшбэк" }),
      txn({ kind: "adjustment", direction: "expense", grossCents: 9000, description: "Продукты" }),
    ];
    const sum = incomeSources(txns).reduce((s, x) => s + x.totalCents, 0);
    expect(sum).toBe(computePnL(txns).netRevenueCents);
  });
});

describe("inPeriod", () => {
  it("включает [from, to) — нижняя граница входит, верхняя нет", () => {
    const period = { from: new Date("2026-06-01"), to: new Date("2026-07-01") };
    expect(inPeriod(txn({ occurredAt: new Date("2026-06-15") }), period)).toBe(true);
    expect(inPeriod(txn({ occurredAt: new Date("2026-06-01") }), period)).toBe(true);
    expect(inPeriod(txn({ occurredAt: new Date("2026-07-01") }), period)).toBe(false);
    expect(inPeriod(txn({ occurredAt: new Date("2026-05-31") }), period)).toBe(false);
  });
});
