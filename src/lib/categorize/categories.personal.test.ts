import { describe, it, expect } from "vitest";
import { categorizeByRulesFor } from "./categories";

describe("categorizeByRulesFor (personal)", () => {
  it("относит бытовые траты к личным категориям", () => {
    expect(categorizeByRulesFor("personal", "Аренда квартиры", "adjustment")).toBe("Жильё и коммуналка");
    expect(categorizeByRulesFor("personal", "Mercadona", "adjustment")).toBe("Продукты");
    expect(categorizeByRulesFor("personal", "Netflix", "adjustment")).toBe("Подписки");
    expect(categorizeByRulesFor("personal", "Uber", "adjustment")).toBe("Транспорт");
    expect(categorizeByRulesFor("personal", "Booking.com", "adjustment")).toBe("Путешествия");
  });

  it("комиссии → «Комиссии» в личном режиме", () => {
    expect(categorizeByRulesFor("personal", "bank fee", "fee")).toBe("Комиссии");
  });

  it("business-режим не меняется — идёт по бизнес-правилам", () => {
    expect(categorizeByRulesFor("business", "Google Ads", "adjustment")).toBe("Реклама и маркетинг");
    expect(categorizeByRulesFor("business", "bank fee", "fee")).toBe("Банковские комиссии");
  });

  it("бизнес: переводы/инвестиции из выписок → «Переводы» (не траты)", () => {
    const t = (d: string) => categorizeByRulesFor("business", d, "adjustment");
    expect(t("До інвестиційного рахунку")).toBe("Переводы");
    expect(t("Transfer to Revolut Digital Assets Europe Ltd")).toBe("Переводы");
    expect(t("Traspaso")).toBe("Переводы");
    expect(t("Зняття готівки: Ing Bank")).toBe("Переводы");
    expect(t("Exchanged to EUR")).toBe("Переводы");
  });

  it("бизнес: новые мерчанты правил", () => {
    const t = (d: string) => categorizeByRulesFor("business", d, "adjustment");
    expect(t("Anthropic* Claude Sub")).toBe("ПО и подписки");
    expect(t("Openai *chatgpt Subscr")).toBe("ПО и подписки");
    expect(t("Комісії плану Metal")).toBe("Банковские комиссии");
  });

  it("неизвестное описание → null", () => {
    expect(categorizeByRulesFor("personal", "zxcqwe random", "adjustment")).toBeNull();
  });

  // Реальные формулировки из банковских выписок (Revolut, укр/исп/англ).
  it("инвестиции и переводы между своими счетами → «Накопления/Перевод»", () => {
    const t = (d: string) => categorizeByRulesFor("personal", d, "adjustment");
    expect(t("До інвестиційного рахунку")).toBe("Накопления/Перевод");
    expect(t("Поповнити From investment account")).toBe("Накопления/Перевод");
    expect(t("Платіж від IVAN KOROLOV Traspaso")).toBe("Накопления/Перевод");
    expect(t("Transfer to Revolut Digital Assets Europe Ltd")).toBe("Накопления/Перевод");
    expect(t("EUR Revolut X")).toBe("Накопления/Перевод");
    expect(t("Зняття готівки: Ing Bank")).toBe("Накопления/Перевод");
    expect(t("Exchanged to EUR")).toBe("Накопления/Перевод");
  });

  it("обычная исходящая отправка (не свой счёт) → трата «Прочее», не перевод", () => {
    const t = (d: string) => categorizeByRulesFor("personal", d, "adjustment");
    expect(t("Надіслано з Revolut")).toBe("Прочее");
    expect(t("Отправлено из Revolut")).toBe("Прочее");
    expect(t("Sent from Revolut")).toBe("Прочее");
  });

  it("явный признак своего счёта/инвестиций всё ещё побеждает «отправку»", () => {
    const t = (d: string) => categorizeByRulesFor("personal", d, "adjustment");
    expect(t("To investment account")).toBe("Накопления/Перевод");
    expect(t("Надіслано на інвестиційний рахунок")).toBe("Накопления/Перевод");
  });

  it("мерчанты из реальной выписки попадают в правильные категории", () => {
    const t = (d: string) => categorizeByRulesFor("personal", d, "adjustment");
    expect(t("Wizz Air Si32nl, Wizzair.com")).toBe("Путешествия");
    expect(t("BILLA 530 04, Varna")).toBe("Продукты");
    expect(t("www.1global.com/*London eSIM")).toBe("Жильё и коммуналка");
    expect(t("Prtmn *kyivstar T, Kyiv")).toBe("Жильё и коммуналка");
    expect(t("Openai *chatgpt Subscr, Dublin")).toBe("Подписки");
    expect(t("Anthropic* Claude Sub")).toBe("Подписки");
    expect(t("Autogrill 7202 Kfc, Fiumicino")).toBe("Кафе и рестораны");
    expect(t("Комісії плану Metal")).toBe("Комиссии");
    expect(t("El Corte Ingles Tenerifet")).toBe("Покупки");
  });
});
