import { describe, it, expect } from "vitest";
import { convertCents, type Rates } from "./fx";

const rates: Rates = { EUR: 1, USD: 1.08, GBP: 0.85, UAH: 50 };

describe("convertCents", () => {
  it("возвращает ту же сумму при одинаковой валюте", () => {
    expect(convertCents(10000, "EUR", "EUR", rates)).toBe(10000);
    expect(convertCents(10000, "usd", "USD", rates)).toBe(10000);
  });

  it("конвертирует через EUR в обе стороны", () => {
    expect(convertCents(10800, "USD", "EUR", rates)).toBe(10000);
    expect(convertCents(10000, "EUR", "USD", rates)).toBe(10800);
    expect(convertCents(10000, "USD", "GBP", rates)).toBe(7870);
  });

  it("регистр валюты не важен", () => {
    expect(convertCents(10800, "usd", "eur", rates)).toBe(10000);
  });

  it("конвертирует гривну (UAH) через EUR", () => {
    // 1 EUR = 50 UAH: 5000 UAH → 100 EUR; 100 EUR → 5000 UAH
    expect(convertCents(500000, "UAH", "EUR", rates)).toBe(10000);
    expect(convertCents(10000, "EUR", "UAH", rates)).toBe(500000);
    // 108 USD → 100 EUR → 5000 UAH
    expect(convertCents(10800, "USD", "UAH", rates)).toBe(500000);
  });

  it("неизвестную валюту оставляет как есть", () => {
    expect(convertCents(10000, "JPY", "EUR", rates)).toBe(10000);
  });
});
