import { describe, it, expect } from "vitest";
import { computeSafeToSpend, DEFAULT_STS_OPTIONS } from "./safeToSpend";

const base = {
  balanceCents: 648000,                 // €6 480 на счетах
  expectedIncomeRemainingCents: 420000, // €4 200 зарплата впереди
  committedBillsCents: 110000,          // €1 100 счета (аренда+коммуналка)
  budgetReservesCents: 0,
  bufferCents: 200000,                  // €2 000 буфер
  asOf: new Date(Date.UTC(2026, 6, 7)), // 7 июля
  periodEnd: new Date(Date.UTC(2026, 6, 25)), // 25 июля (зарплата)
};

// available = 648000 + 420000 − 110000 − 0 − 200000 = 758000
const FREE = 758000;

describe("computeSafeToSpend", () => {
  it("придерживает резерв на непредвиденное (по умолчанию 25%)", () => {
    const r = computeSafeToSpend(base);
    expect(r.reserveCents).toBe(Math.round(FREE * DEFAULT_STS_OPTIONS.prudenceReservePct));
    expect(r.totalCents).toBe(FREE - r.reserveCents);
    expect(r.daysLeft).toBe(18);
    expect(r.perDayCents).toBe(Math.round(r.totalCents / 18));
  });

  it("резерв отключаем через opts → старая формула", () => {
    const r = computeSafeToSpend(base, { prudenceReservePct: 0 });
    expect(r.totalCents).toBe(FREE);
    expect(r.reserveCents).toBe(0);
  });

  it("не уходит в минус — total не меньше нуля", () => {
    const r = computeSafeToSpend({ ...base, balanceCents: 0, expectedIncomeRemainingCents: 0 });
    expect(r.totalCents).toBe(0);
    expect(r.perDayCents).toBe(0);
  });

  it("буфер и счета уменьшают доступное", () => {
    const withoutBuffer = computeSafeToSpend({ ...base, bufferCents: 0 }, { prudenceReservePct: 0 });
    expect(withoutBuffer.totalCents).toBe(958000);
    const moreBills = computeSafeToSpend({ ...base, committedBillsCents: 300000 }, { prudenceReservePct: 0 });
    expect(moreBills.totalCents).toBe(568000);
  });

  it("daysLeft минимум 1 (без деления на ноль в день зарплаты)", () => {
    const r = computeSafeToSpend({ ...base, asOf: base.periodEnd });
    expect(r.daysLeft).toBe(1);
  });

  it("в конце периода НЕ советует потратить всё за день — сглаживание minSpreadDays", () => {
    // За день до зарплаты свободно ~2900 € — дневной лимит должен быть
    // total/7, а не total/1 (реальный кейс: «4000 € в день» — перебор).
    const r = computeSafeToSpend({ ...base, asOf: new Date(Date.UTC(2026, 6, 24)) });
    expect(r.daysLeft).toBe(1);
    expect(r.perDayCents).toBe(Math.round(r.totalCents / DEFAULT_STS_OPTIONS.minSpreadDays));
    expect(r.perDayCents).toBeLessThan(r.totalCents);
  });
});

describe("computeSafeToSpend — режим «% от дохода» (личный план трат)", () => {
  const target = {
    ...base,
    monthlyIncomeCents: 250000,   // зарплата €2 500
    spendTargetPct: 70,           // тратить не больше 70%
    spentThisMonthCents: 60000,   // уже потрачено €600
  };

  it("лимит = доход × 70% − потраченное", () => {
    const r = computeSafeToSpend(target);
    expect(r.mode).toBe("target");
    expect(r.spendTargetCents).toBe(175000); // 2500 × 0.7
    expect(r.totalCents).toBe(115000);       // 1750 − 600
    expect(r.reserveCents).toBe(0);          // резерв не нужен — план и так консервативен
  });

  it("план не больше физически доступного (остаток − счета − буфер)", () => {
    const r = computeSafeToSpend({ ...target, balanceCents: 100000, expectedIncomeRemainingCents: 0 });
    // physAvailable: 100000 − 110000 − 200000 < 0 → 0
    expect(r.totalCents).toBe(0);
  });

  it("перерасход плана → ноль, не минус", () => {
    const r = computeSafeToSpend({ ...target, spentThisMonthCents: 999999 });
    expect(r.totalCents).toBe(0);
  });

  it("счета не заведены (баланс 0) → показываем план по доходу, не зануляем", () => {
    const r = computeSafeToSpend({ ...target, balanceCents: 0, expectedIncomeRemainingCents: 0 });
    expect(r.totalCents).toBe(115000);        // 175000 − 60000, без урезания по 0-балансу
    expect(r.cappedByAvailable).toBe(false);
  });

  it("без процента или без дохода → автоформула", () => {
    expect(computeSafeToSpend({ ...target, spendTargetPct: null }).mode).toBe("auto");
    expect(computeSafeToSpend({ ...target, monthlyIncomeCents: 0 }).mode).toBe("auto");
  });

  it("отдаёт входы формулы и флаг «урезано по доступному» для прозрачности UI", () => {
    const free = computeSafeToSpend(target);
    expect(free.cappedByAvailable).toBe(false);
    expect(free.balanceCents).toBe(target.balanceCents);
    expect(free.monthlyIncomeCents).toBe(250000);

    const poor = computeSafeToSpend({ ...target, balanceCents: 320000, expectedIncomeRemainingCents: 0 });
    // physAvailable = 320000−110000−200000 = 10000 < remaining 115000 → capped
    expect(poor.cappedByAvailable).toBe(true);
    expect(poor.totalCents).toBe(10000);
  });
});
