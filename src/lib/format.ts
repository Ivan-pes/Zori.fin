import { currencySymbol } from "./currency";

// Деньги всегда со знаком валюты (₴, zł, Kč…), а не с кодом: Intl для многих
// валют в ru-локали выводит «CHF/PLN/CZK», поэтому число форматируем сами,
// а знак берём из единой карты CURRENCY_SYMBOL.
export function formatMoney(cents: number, currency = "EUR", locale = "ru-RU"): string {
  const num = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${num} ${currencySymbol(currency)}`;
}

// Короткий формат без копеек — для карточек/списков: «2 500 ₴».
export function formatMoneyShort(cents: number, currency = "EUR", locale = "ru-RU"): string {
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(cents / 100);
  return `${num} ${currencySymbol(currency)}`;
}

export function formatPct(pct: number): string {
  return `${pct.toFixed(1)} %`;
}

export function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}
