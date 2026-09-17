import { describe, it, expect } from "vitest";
import { computeUpcomingBills, subscriptionSummary, manualSubsByCategory, nextDueAfter } from "./bills";
import type { RecurringExpense } from "./recurring";

function rec(merchant: string, avg: number, lastChargeAt: string, opts: Partial<RecurringExpense> = {}): RecurringExpense {
  return {
    merchant, count: 4, avgAmountCents: avg, cadence: "monthly", lastChargeAt,
    monthlyEstimateCents: avg, category: null, daysSinceLast: 5, stale: false, ...opts,
  };
}

describe("computeUpcomingBills", () => {
  const asOf = new Date("2026-07-07T00:00:00Z");

  it("возвращает списания в горизонте, отсортированные по дате", () => {
    const bills = computeUpcomingBills([
      rec("Rent", 90000, "2026-06-11"),   // next ~11 июля
      rec("Netflix", 1599, "2026-06-13"), // next ~13 июля
    ], { horizonDays: 30, asOf });
    expect(bills.length).toBe(2);
    expect(bills[0]!.label).toBe("Rent");
    expect(bills[0]!.dueDate.getTime()).toBeLessThan(bills[1]!.dueDate.getTime());
    expect(bills[0]!.daysUntil).toBeGreaterThanOrEqual(0);
  });

  it("не включает списания за горизонтом", () => {
    const bills = computeUpcomingBills([rec("Rent", 90000, "2026-06-11")], { horizonDays: 2, asOf });
    expect(bills.length).toBe(0);
  });
});

describe("nextDueAfter (материализация подписок)", () => {
  it("weekly: +7 дней", () => {
    expect(nextDueAfter("2026-07-10", "weekly")).toBe("2026-07-17");
  });
  it("monthly: тот же день следующего месяца", () => {
    expect(nextDueAfter("2026-07-25", "monthly")).toBe("2026-08-25");
  });
  it("monthly: 31-е клампится до конца короткого месяца", () => {
    expect(nextDueAfter("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDueAfter("2026-08-31", "monthly")).toBe("2026-09-30");
  });
});

describe("manualSubsByCategory (резерв конвертов регулярными платежами)", () => {
  const from = new Date("2026-07-10T00:00:00Z");
  const to = new Date("2026-08-01T00:00:00Z");

  it("зарплата в окне попадает в свою категорию", () => {
    const m = manualSubsByCategory(
      [{ amountCents: 300000, cadence: "monthly", nextDue: "2026-07-25", category: "Зарплата" }],
      from, to
    );
    expect(m.get("Зарплата")).toBe(300000);
  });

  it("недельный платёж считается по числу вхождений в окно", () => {
    const m = manualSubsByCategory(
      [{ amountCents: 5000, cadence: "weekly", nextDue: "2026-07-12", category: "Подрядчики и услуги" }],
      from, to
    );
    // 12, 19, 26 июля → 3 вхождения
    expect(m.get("Подрядчики и услуги")).toBe(15000);
  });

  it("платёж в прошлом докручивается до окна; вне окна и без категории — не считается", () => {
    const m = manualSubsByCategory(
      [
        { amountCents: 90000, cadence: "monthly", nextDue: "2026-05-15", category: "Аренда" }, // догон: ~14 июля
        { amountCents: 7000, cadence: "monthly", nextDue: "2026-08-05", category: "Аренда" },  // вне окна
        { amountCents: 9999, cadence: "monthly", nextDue: "2026-07-20", category: null },      // без категории
      ],
      from, to
    );
    expect(m.get("Аренда")).toBe(90000);
    expect(m.size).toBe(1);
  });

  it("платёж без даты считается ожидаемым в начале окна", () => {
    const m = manualSubsByCategory(
      [{ amountCents: 300000, cadence: "monthly", nextDue: null, category: "Зарплата" }],
      from, to
    );
    expect(m.get("Зарплата")).toBe(300000);
  });
});

describe("subscriptionSummary", () => {
  it("считает количество, месяц, год и зомби-подписки", () => {
    const s = subscriptionSummary([
      rec("Netflix", 1599, "2026-06-13", { monthlyEstimateCents: 1599 }),
      rec("Gym", 3900, "2026-04-01", { monthlyEstimateCents: 3900, stale: true, daysSinceLast: 74 }),
    ]);
    expect(s.count).toBe(2);
    expect(s.monthlyCents).toBe(5499);
    expect(s.yearlyCents).toBe(5499 * 12);
    expect(s.staleCount).toBe(1);
  });
});
