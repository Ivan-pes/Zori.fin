import { describe, it, expect } from "vitest";
import { parseAmountToCents, parseDateFlexible } from "./normalize";
import { parseCsv } from "./parse";

describe("parseAmountToCents", () => {
  it("US-формат: 1,234.56 → 123456", () => {
    expect(parseAmountToCents("1,234.56")).toBe(123456);
  });
  it("EU-формат: 1.234,56 → 123456", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123456);
  });
  it("целое без дроби: 1000 → 100000", () => {
    expect(parseAmountToCents("1000")).toBe(100000);
  });
  it("EU-тысячи без дроби: 1.000 → 100000", () => {
    expect(parseAmountToCents("1.000")).toBe(100000);
  });
  it("одна цифра дроби: 1234.5 → 123450", () => {
    expect(parseAmountToCents("1234.5")).toBe(123450);
  });
  it("отрицательное со знаком: -50,00 → -5000", () => {
    expect(parseAmountToCents("-50,00")).toBe(-5000);
  });
  it("скобки = отрицательное: (50.00) → -5000", () => {
    expect(parseAmountToCents("(50.00)")).toBe(-5000);
  });
  it("с символом валюты: € 1 234,56 → 123456", () => {
    expect(parseAmountToCents("€ 1 234,56")).toBe(123456);
  });
  it("пусто → null", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("  ")).toBeNull();
  });
});

describe("parseDateFlexible", () => {
  it("ISO YYYY-MM-DD", () => {
    expect(parseDateFlexible("2026-06-22")?.toISOString().slice(0, 10)).toBe("2026-06-22");
  });
  it("EU DD.MM.YYYY", () => {
    expect(parseDateFlexible("22.06.2026")?.toISOString().slice(0, 10)).toBe("2026-06-22");
  });
  it("слэши DD/MM/YYYY (день-месяц по умолчанию)", () => {
    expect(parseDateFlexible("03/06/2026")?.toISOString().slice(0, 10)).toBe("2026-06-03");
  });
  it("явный день >12 распознаётся как день: 13/06/2026", () => {
    expect(parseDateFlexible("13/06/2026")?.toISOString().slice(0, 10)).toBe("2026-06-13");
  });
  it("двузначный год: 22.06.26", () => {
    expect(parseDateFlexible("22.06.26")?.toISOString().slice(0, 10)).toBe("2026-06-22");
  });
  it("украинский месяц: 30 квіт. 2026р. → апрель", () => {
    expect(parseDateFlexible("30 квіт. 2026р.")?.toISOString().slice(0, 10)).toBe("2026-04-30");
  });
  it("украинский месяц: 3 трав. 2026р. → май", () => {
    expect(parseDateFlexible("3 трав. 2026р.")?.toISOString().slice(0, 10)).toBe("2026-05-03");
  });
  it("испанский месяц: 5 mayo 2026", () => {
    expect(parseDateFlexible("5 mayo 2026")?.toISOString().slice(0, 10)).toBe("2026-05-05");
  });
  it("английский месяц: 15 May 2026", () => {
    expect(parseDateFlexible("15 May 2026")?.toISOString().slice(0, 10)).toBe("2026-05-15");
  });
  it("мусор → null", () => {
    expect(parseDateFlexible("не дата")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("разделитель — точка с запятой, поля в кавычках", () => {
    const text = `Дата;Назначение;Сумма\n22.06.2026;"Аренда офиса, июнь";-1.200,00\n21.06.2026;Оплата от клиента;3.000,00`;
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(["Дата", "Назначение", "Сумма"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["22.06.2026", "Аренда офиса, июнь", "-1.200,00"]);
  });

  it("запятая-разделитель и BOM", () => {
    const text = `﻿Date,Description,Amount\n2026-06-22,Coffee,-4.50`;
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(rows[0]).toEqual(["2026-06-22", "Coffee", "-4.50"]);
  });
});
