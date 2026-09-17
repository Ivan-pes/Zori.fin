import { describe, it, expect } from "vitest";
import { reportFrequencyFromPrefs, shouldSendReport } from "./frequency";

describe("reportFrequencyFromPrefs", () => {
  it("читает явную частоту", () => {
    expect(reportFrequencyFromPrefs({ reportFrequency: "daily" })).toBe("daily");
    expect(reportFrequencyFromPrefs({ reportFrequency: "monthly" })).toBe("monthly");
  });
  it("обратная совместимость со старым weekly:boolean", () => {
    expect(reportFrequencyFromPrefs({ weekly: false })).toBe("off");
    expect(reportFrequencyFromPrefs({ weekly: true })).toBe("weekly");
  });
  it("по умолчанию — weekly", () => {
    expect(reportFrequencyFromPrefs(null)).toBe("weekly");
    expect(reportFrequencyFromPrefs({})).toBe("weekly");
    expect(reportFrequencyFromPrefs({ reportFrequency: "мусор" })).toBe("weekly");
  });
});

describe("shouldSendReport", () => {
  const monday = new Date("2026-06-29T07:00:00Z");
  const tuesday = new Date("2026-06-30T07:00:00Z");
  const first = new Date("2026-07-01T07:00:00Z");

  it("off — никогда", () => expect(shouldSendReport("off", monday)).toBe(false));
  it("daily — всегда", () => expect(shouldSendReport("daily", tuesday)).toBe(true));
  it("weekly — только в понедельник", () => {
    expect(shouldSendReport("weekly", monday)).toBe(true);
    expect(shouldSendReport("weekly", tuesday)).toBe(false);
  });
  it("monthly — только 1-го числа", () => {
    expect(shouldSendReport("monthly", first)).toBe(true);
    expect(shouldSendReport("monthly", tuesday)).toBe(false);
  });
});
