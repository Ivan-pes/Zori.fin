import { describe, it, expect } from "vitest";
import { classifyMonth, summarizeCoverage, monthLabel, type MonthCoverage } from "./coverage-utils";

describe("classifyMonth", () => {
  it("locked имеет приоритет", () => {
    expect(classifyMonth({ inc: 5, exp: 5 }, true)).toBe("locked");
    expect(classifyMonth(undefined, true)).toBe("locked");
  });
  it("есть расходы → ok", () => {
    expect(classifyMonth({ inc: 3, exp: 2 }, false)).toBe("ok");
    expect(classifyMonth({ inc: 0, exp: 2 }, false)).toBe("ok");
  });
  it("только доходы → income_only", () => {
    expect(classifyMonth({ inc: 4, exp: 0 }, false)).toBe("income_only");
  });
  it("нет операций → empty", () => {
    expect(classifyMonth(undefined, false)).toBe("empty");
    expect(classifyMonth({ inc: 0, exp: 0 }, false)).toBe("empty");
  });
});

describe("summarizeCoverage", () => {
  const cov: MonthCoverage[] = [
    { month: "2026-06", txCount: 10, incomeCount: 5, expenseCount: 5, sources: ["csv"], status: "ok" },
    { month: "2026-05", txCount: 3, incomeCount: 3, expenseCount: 0, sources: ["stripe"], status: "income_only" },
    { month: "2026-04", txCount: 0, incomeCount: 0, expenseCount: 0, sources: [], status: "empty" },
    { month: "2026-03", txCount: 0, incomeCount: 0, expenseCount: 0, sources: [], status: "locked" },
  ];
  it("считает видимые месяцы без locked", () => {
    const s = summarizeCoverage(cov);
    expect(s.totalVisible).toBe(3);
    expect(s.okCount).toBe(1);
    expect(s.incomeOnly).toEqual(["2026-05"]);
    expect(s.empty).toEqual(["2026-04"]);
  });
});

describe("monthLabel", () => {
  it("'2026-06' → 'июнь 2026 г.'", () => {
    expect(monthLabel("2026-06")).toBe("июнь 2026 г.");
  });
});
