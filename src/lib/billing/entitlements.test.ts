import { describe, it, expect } from "vitest";
import { can, limit, withinLimit, minPlanFor } from "./entitlements";
import { canP, limitP, withinLimitP } from "./entitlements.personal";

describe("entitlements: features", () => {
  it("forecast открыт со Starter (не Free)", () => {
    expect(can("free", "forecast")).toBe(false);
    expect(can("starter", "forecast")).toBe(true);
    expect(can("growth", "forecast")).toBe(true);
    expect(can("pro", "forecast")).toBe(true);
  });

  it("еженедельные отчёты и алерты — с Growth", () => {
    expect(can("starter", "weeklyReports")).toBe(false);
    expect(can("growth", "weeklyReports")).toBe(true);
    expect(can("starter", "cashGapAlerts")).toBe(false);
    expect(can("growth", "cashGapAlerts")).toBe(true);
  });

  it("на Starter экспорт PDF выключен (только CSV)", () => {
    expect(can("starter", "exportPdf")).toBe(false);
    expect(can("growth", "exportPdf")).toBe(true);
    expect(can("pro", "exportExcel")).toBe(true);
    expect(can("growth", "exportExcel")).toBe(false);
  });

  it("бенчмарки/мультивалюта/бухгалтерия — только Pro", () => {
    for (const p of ["free", "starter", "growth"] as const) {
      expect(can(p, "benchmarks")).toBe(false);
      expect(can(p, "multiCurrency")).toBe(false);
      expect(can(p, "accountingIntegrations")).toBe(false);
    }
    expect(can("pro", "benchmarks")).toBe(true);
  });
});

describe("entitlements: limits", () => {
  it("источники растут по тарифам, Pro — безлимит", () => {
    expect(limit("free", "integrations")).toBe(1);
    expect(limit("starter", "integrations")).toBe(2);
    expect(limit("growth", "integrations")).toBe(4);
    expect(limit("pro", "integrations")).toBe(-1);
  });

  it("withinLimit уважает лимит и безлимит (-1)", () => {
    expect(withinLimit("free", "aiQuestions", 9)).toBe(true);
    expect(withinLimit("free", "aiQuestions", 10)).toBe(false);
    expect(withinLimit("growth", "aiQuestions", 99999)).toBe(true);
    expect(withinLimit("free", "statementImports", 2)).toBe(false);
    expect(withinLimit("starter", "statementImports", 9)).toBe(true);
  });

  it("глубина истории по тарифам", () => {
    expect(limit("free", "historyMonths")).toBe(3);
    expect(limit("starter", "historyMonths")).toBe(12);
    expect(limit("growth", "historyMonths")).toBe(24);
    expect(limit("pro", "historyMonths")).toBe(-1);
  });
});

describe("minPlanFor", () => {
  it("называет минимально нужный тариф", () => {
    expect(minPlanFor("forecast")).toBe("starter");
    expect(minPlanFor("weeklyReports")).toBe("growth");
    expect(minPlanFor("benchmarks")).toBe("pro");
  });
});

describe("личные entitlements: household", () => {
  it("household открыт только на Plus", () => {
    expect(canP("free_personal", "household")).toBe(false);
    expect(canP("plus", "household")).toBe(true);
  });

  it("участники семейного бюджета: Free — соло, Plus — до 4 приглашённых", () => {
    expect(limitP("free_personal", "householdMembers")).toBe(0);
    expect(limitP("plus", "householdMembers")).toBe(4);
    // occupancy = владелец + приглашённые; приглашать можно, пока занято < мест
    const seatsPlus = 1 + limitP("plus", "householdMembers");
    expect(seatsPlus).toBe(5);
    expect(withinLimitP("plus", "householdMembers", 3)).toBe(true);
    expect(withinLimitP("plus", "householdMembers", 4)).toBe(false);
  });
});
