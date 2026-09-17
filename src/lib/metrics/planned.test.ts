import { describe, it, expect } from "vitest";
import { expandPlanned, plannedNetCents, type PlannedItem } from "./planned";

function item(p: Partial<PlannedItem>): PlannedItem {
  return {
    id: "1", label: "X", amountCents: 1000, direction: "expense", category: null,
    kind: "once", startDay: "2026-07-10", endDay: null, ...p,
  };
}

describe("expandPlanned", () => {
  const from = new Date("2026-07-01T00:00:00Z");
  const to = new Date("2026-10-01T00:00:00Z");

  it("разовая трата даёт одну дату", () => {
    const occ = expandPlanned([item({ kind: "once", startDay: "2026-07-10" })], from, to);
    expect(occ.length).toBe(1);
    expect(occ[0]!.day).toBe("2026-07-10");
  });

  it("подписка повторяется каждый месяц с дня старта", () => {
    const occ = expandPlanned([item({ kind: "monthly", startDay: "2026-07-15", amountCents: 1599 })], from, to);
    expect(occ.map((o) => o.day)).toEqual(["2026-07-15", "2026-08-15", "2026-09-15"]);
  });

  it("end_day отменяет подписку с этой даты", () => {
    const occ = expandPlanned([item({ kind: "monthly", startDay: "2026-07-15", endDay: "2026-09-01" })], from, to);
    expect(occ.map((o) => o.day)).toEqual(["2026-07-15", "2026-08-15"]);
  });

  it("вне диапазона — пусто", () => {
    const occ = expandPlanned([item({ kind: "once", startDay: "2026-06-10" })], from, to);
    expect(occ.length).toBe(0);
  });

  it("plannedNetCents суммирует по направлению", () => {
    const occ = expandPlanned([
      item({ id: "a", kind: "monthly", startDay: "2026-07-15", amountCents: 2000, direction: "expense" }),
      item({ id: "b", kind: "once", startDay: "2026-07-20", amountCents: 5000, direction: "income" }),
    ], from, new Date("2026-08-01T00:00:00Z"));
    const net = plannedNetCents(occ);
    expect(net.plannedExpenseCents).toBe(2000);
    expect(net.plannedIncomeCents).toBe(5000);
  });
});
