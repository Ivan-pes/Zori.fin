// Доступные валюты пространства (клиент-безопасно, без fetch/БД).
// ЕДИНЫЙ источник правды: список используется и в UI-селекторах, и в zod-enum
// на API (settings/accounts/subscriptions) — добавить валюту = одна строка тут.
// Курсы к EUR — см. src/lib/fx.ts (ЕЦБ/frankfurter + НБУ для UAH; фолбэк на все).
// Только валюты с 2 знаками после запятой (модель «cents = сумма×100»); JPY и
// прочие бездробные сюда не добавляем, чтобы не ломать арифметику импорта.
export const CURRENCIES = [
  "EUR", "USD", "GBP", "UAH", "CHF", "PLN", "CZK", "SEK", "NOK", "DKK", "CAD", "AUD",
] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  UAH: "₴",
  CHF: "Fr",
  PLN: "zł",
  CZK: "Kč",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  CAD: "$",
  AUD: "$",
  // Не входят в CURRENCIES, но встречаются в импортах/оригинальных суммах (FX):
  RUB: "₽",
  JPY: "¥",
  CNY: "¥",
  TRY: "₺",
  RON: "lei",
  HUF: "Ft",
  BGN: "лв",
  MDL: "L",
  GEL: "₾",
  KZT: "₸",
  AZN: "₼",
  BYN: "Br",
  ILS: "₪",
  INR: "₹",
  BRL: "R$",
  MXN: "$",
  ZAR: "R",
  KRW: "₩",
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOL[(code || "").toUpperCase()] ?? code;
}
