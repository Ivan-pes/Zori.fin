/**
 * Здоровые коридоры доли категории от дохода (личное) / выручки (бизнес) — §2.9.
 * Значения — ориентиры (эмпирические нормы личных финансов), не жёсткие правила.
 * Пороги вынесены сюда, чтобы не плодить магические числа по коду.
 */

export interface Benchmark {
  /** максимальная здоровая доля, % */
  healthyMaxPct: number;
}

/** Личные нормы: доля категории от дохода. */
export const PERSONAL_BENCHMARKS: Record<string, Benchmark> = {
  "Жильё и коммуналка": { healthyMaxPct: 30 },
  Продукты: { healthyMaxPct: 15 },
  "Кафе и рестораны": { healthyMaxPct: 10 },
  Транспорт: { healthyMaxPct: 15 },
  Подписки: { healthyMaxPct: 5 },
  Развлечения: { healthyMaxPct: 10 },
  Покупки: { healthyMaxPct: 15 },
};

/** Бизнес-нормы: доля категории от выручки. */
export const BUSINESS_BENCHMARKS: Record<string, Benchmark> = {
  "Реклама и маркетинг": { healthyMaxPct: 30 },
  "ПО и подписки": { healthyMaxPct: 15 },
  Аренда: { healthyMaxPct: 20 },
  Зарплата: { healthyMaxPct: 50 },
};

export function benchmarkFor(
  accountType: "business" | "personal",
  category: string
): Benchmark | null {
  const table = accountType === "personal" ? PERSONAL_BENCHMARKS : BUSINESS_BENCHMARKS;
  return table[category] ?? null;
}
