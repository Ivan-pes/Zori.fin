import { describe, it, expect } from "vitest";
import { computeBudgetStatus, spentByCategory } from "./budgets";
import type { NormalizedTransaction } from "@/types";

function tx(gross: number, category: string | null, dir: "income" | "expense" = "expense"): NormalizedTransaction {
  return {
    id: `${category}-${gross}`, source: "csv", externalId: `${category}-${gross}`, kind: "adjustment",
    direction: dir, grossCents: gross, feeCents: 0, netCents: -gross,
    currency: "EUR", occurredAt: new Date(Date.UTC(2026, 6, 5)), description: category, category,
  };
}

describe("spentByCategory", () => {
  it("суммирует расходы по категориям, игнорирует доход", () => {
    const m = spentByCategory([tx(20000, "Продукты"), tx(15000, "Продукты"), tx(90000, "Жильё и коммуналка"), tx(500000, "Зарплата", "income")]);
    expect(m.get("Продукты")).toBe(35000);
    expect(m.get("Жильё и коммуналка")).toBe(90000);
    expect(m.has("Зарплата")).toBe(false);
  });
});

describe("computeBudgetStatus", () => {
  const limits = [{ category: "Продукты", limitCents: 40000 }, { category: "Кафе и рестораны", limitCents: 20000 }];

  it("считает потрачено/остаток/процент", () => {
    const lines = computeBudgetStatus(limits, [tx(30000, "Продукты"), tx(5000, "Кафе и рестораны")], { dayOfMonth: 15, daysInMonth: 30 });
    const food = lines.find((l) => l.category === "Продукты")!;
    expect(food.spentCents).toBe(30000);
    expect(food.remainingCents).toBe(10000);
    expect(food.pct).toBe(75);
  });

  it("pace=over при превышении лимита", () => {
    const lines = computeBudgetStatus(limits, [tx(45000, "Продукты")], { dayOfMonth: 20, daysInMonth: 30 });
    expect(lines.find((l) => l.category === "Продукты")!.pace).toBe("over");
  });

  it("pace=over при опережении темпа (потрачено больше, чем должно к этому дню)", () => {
    // день 5/30 → ожидаем ~16% лимита (6667). Тратим 20000 → сильно опережаем.
    const lines = computeBudgetStatus(limits, [tx(20000, "Продукты")], { dayOfMonth: 5, daysInMonth: 30 });
    expect(lines.find((l) => l.category === "Продукты")!.pace).toBe("over");
  });

  it("pace=under когда тратим медленнее темпа", () => {
    // день 25/30 → ожидаем ~83% (33333). Тратим 5000 → сильно меньше.
    const lines = computeBudgetStatus(limits, [tx(5000, "Продукты")], { dayOfMonth: 25, daysInMonth: 30 });
    expect(lines.find((l) => l.category === "Продукты")!.pace).toBe("under");
  });

  it("плановые траты из календаря резервируют конверт (входят в прогресс и остаток)", () => {
    const planned = new Map([["Продукты", 15000]]); // запланировано €150
    const lines = computeBudgetStatus(limits, [tx(20000, "Продукты")], {
      dayOfMonth: 15, daysInMonth: 30, plannedByCategory: planned,
    });
    const food = lines.find((l) => l.category === "Продукты")!;
    expect(food.spentCents).toBe(20000);
    expect(food.plannedCents).toBe(15000);
    expect(food.remainingCents).toBe(5000);   // 400 − 200 − 150
    expect(food.pct).toBe(88);                // (200+150)/400
  });

  it("конверт «Накопления/Перевод» — цель: заполняется сделанными переводами", () => {
    const lines = computeBudgetStatus(
      [{ category: "Накопления/Перевод", limitCents: 30000 }],
      [tx(20000, "Накопления/Перевод")],
      { dayOfMonth: 15, daysInMonth: 30 }
    );
    const goal = lines.find((l) => l.category === "Накопления/Перевод")!;
    expect(goal.spentCents).toBe(20000); // отложил 200 из цели 300
    expect(goal.pct).toBe(67);
  });

  it("факт + план больше лимита → over заранее", () => {
    const planned = new Map([["Продукты", 25000]]);
    const lines = computeBudgetStatus(limits, [tx(20000, "Продукты")], {
      dayOfMonth: 10, daysInMonth: 30, plannedByCategory: planned,
    });
    expect(lines.find((l) => l.category === "Продукты")!.pace).toBe("over");
  });
});
