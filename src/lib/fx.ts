
export type Rates = Record<string, number>;

// Курсы к EUR (сколько единиц валюты за 1 EUR). Фолбэк на случай, если оба
// источника недоступны — чтобы конвертация всё равно работала (примерно).
export const FALLBACK_RATES: Rates = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  UAH: 45.0,
  CHF: 0.95,
  PLN: 4.3,
  SEK: 11.3,
  NOK: 11.5,
  DKK: 7.46,
  CZK: 25.0,
  CAD: 1.47,
  AUD: 1.63,
  JPY: 169.0,
};

interface CacheEntry {
  day: string;
  rates: Rates;
}

const cache: { current: CacheEntry | null } = { current: null };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Гривна: ЕЦБ (frankfurter) её не публикует — берём официальный курс НБУ. */
async function fetchUahPerEur(force: boolean): Promise<number> {
  const init = force
    ? ({ cache: "no-store" } as const)
    : ({ next: { revalidate: 60 * 60 * 12 } } as const);
  const res = await fetch(
    "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json",
    init
  );
  if (!res.ok) throw new Error(`nbu ${res.status}`);
  const data = (await res.json()) as { rate?: number }[];
  const rate = data?.[0]?.rate;
  if (!rate || rate <= 0) throw new Error("no uah rate");
  return rate; // сколько UAH за 1 EUR
}

/**
 * Курсы валют к EUR, кэш на сутки (в памяти инстанса).
 * ECB-валюты (EUR/USD/GBP/…) — frankfurter.app; гривна — НБУ.
 * При сбое любого источника остаёмся на последних известных / фолбэке.
 * force=true — принудительное обновление (для крона в 00:00).
 */
export async function getRates(opts?: { force?: boolean }): Promise<Rates> {
  const force = opts?.force === true;
  const day = today();
  if (!force && cache.current && cache.current.day === day) return cache.current.rates;

  // Стартуем с последних известных (или фолбэка), чтобы частичный сбой не обнулял курсы.
  const rates: Rates = { ...(cache.current?.rates ?? FALLBACK_RATES) };

  try {
    const init = force
      ? ({ cache: "no-store" } as const)
      : ({ next: { revalidate: 60 * 60 * 12 } } as const);
    // frankfurter.dev — канонический домен (старый .app теперь 301-редиректит)
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR", init);
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, number> };
      if (data.rates) Object.assign(rates, { EUR: 1 }, data.rates);
    }
  } catch {
    // оставляем прежние значения для ECB-валют
  }

  try {
    rates.UAH = await fetchUahPerEur(force);
  } catch {
    // оставляем прежний/фолбэк-курс гривны
  }

  cache.current = { day, rates };
  return rates;
}

export function convertCents(
  cents: number,
  from: string,
  to: string,
  rates: Rates
): number {
  const f = (from || "EUR").toUpperCase();
  const t = (to || "EUR").toUpperCase();
  if (f === t) return cents;
  const rf = rates[f];
  const rt = rates[t];
  if (!rf || !rt) return cents;
  return Math.round((cents / rf) * rt);
}
