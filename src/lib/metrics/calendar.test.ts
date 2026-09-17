import { describe, it, expect } from "vitest";
import { buildMonthCalendar, buildEventFeed, nextDueDate } from "./calendar";
import { translator } from "@/lib/i18n/dictionaries";
import type { NormalizedTransaction } from "@/types";
import type { CashForecast } from "./forecast";

const trRu = translator("ru");

function tx(day: number, gross: number, dir: "income" | "expense", desc = "X"): NormalizedTransaction {
  return {
    id: `${day}-${desc}`, source: "csv", externalId: `${day}-${desc}`, kind: "adjustment",
    direction: dir, grossCents: gross, feeCents: 0, netCents: dir === "income" ? gross : -gross,
    currency: "EUR", occurredAt: new Date(Date.UTC(2026, 5, day)), description: desc, category: null,
  };
}

describe("nextDueDate", () => {
  it("месячная: сдвигает от последнего списания на интервал и далее", () => {
    const due = nextDueDate("2026-06-01", "monthly", new Date(Date.UTC(2026, 5, 15)));
    expect(due.toISOString().slice(0, 10)).toBe("2026-07-01");
  });
  it("недельная: ближайшая дата на/после from", () => {
    const due = nextDueDate("2026-06-01", "weekly", new Date(Date.UTC(2026, 5, 15)));
    expect(due.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 5, 15));
  });
});

describe("buildMonthCalendar", () => {
  const today = new Date(Date.UTC(2026, 5, 20));
  const txns = [tx(2, 35800, "income"), tx(2, 17200, "expense", "Аренда"), tx(15, 64000, "expense", "AWS")];

  it("группирует по дням и считает итоги", () => {
    const cal = buildMonthCalendar(txns, { year: 2026, month: 5, today });
    expect(cal.daysInMonth).toBe(30);
    expect(cal.totalInCents).toBe(35800);
    expect(cal.totalOutCents).toBe(17200 + 64000);
    const d2 = cal.days[1]!;
    expect(d2.inCents).toBe(35800);
    expect(d2.outCents).toBe(17200);
    expect(d2.items.length).toBe(2);
  });

  it("помечает сегодня и будущие дни", () => {
    const cal = buildMonthCalendar(txns, { year: 2026, month: 5, today });
    expect(cal.days[19]!.isToday).toBe(true);
    expect(cal.days[24]!.isFuture).toBe(true);
    expect(cal.days[1]!.isFuture).toBe(false);
  });

  it("отмечает день кассового разрыва", () => {
    const cal = buildMonthCalendar(txns, { year: 2026, month: 5, today, gapDate: "2026-06-28" });
    expect(cal.days[27]!.gap).toBe(true);
  });
});

describe("buildEventFeed", () => {
  const fmt = (c: number) => `${(c / 100).toFixed(0)}€`;
  const today = new Date(Date.UTC(2026, 5, 20));

  it("прогноз без разрыва → зелёное событие", () => {
    const forecast = { gapDate: null, endBalanceCents: 900000, horizonDays: 30 } as CashForecast;
    const ev = buildEventFeed({ forecast, fmt, today });
    expect(ev[0]!.tone).toBe("green");
  });

  it("прогноз с разрывом → красное", () => {
    const forecast = { gapDate: "2026-07-05", gapBalanceCents: 30000, horizonDays: 30 } as CashForecast;
    const ev = buildEventFeed({ forecast, fmt, today });
    expect(ev[0]!.tone).toBe("red");
  });

  it("доходы без расходов и резерв под налоги → янтарные", () => {
    const ev = buildEventFeed({ coverageIncomeOnly: true, taxReserveCents: 5200, fmt, today, t: trRu });
    expect(ev.some((e) => e.tone === "amber" && e.title.includes("расход"))).toBe(true);
    expect(ev.some((e) => e.title.includes("налог"))).toBe(true);
  });
});
