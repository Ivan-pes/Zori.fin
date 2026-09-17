import { sql } from "@/lib/db";
import { getAccountContext } from "@/lib/account/context";
import { loadTransactions } from "@/lib/transactions";
import { computePnL } from "./engine";
import { computeRunway } from "./runway";
import {
  computeCategorySignals,
  categorizationCoverage,
  templatesFor,
  type CategorySignal,
  type CategorizationCoverage,
} from "./categorySignals";

const DAY = 86_400_000;

export interface CategorySignalsResult {
  currency: string;
  accountType: "business" | "personal";
  signals: CategorySignal[];
  coverage: CategorizationCoverage;
  /** Опорный месяц (последний с данными), YYYY-MM — для подписи в UI. */
  month: string;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Собирает вход для Category Signals из БД и считает сигналы (Фаза 4).
 * Единый источник для чат-инструментов и UI. Детерминированный слой поверх
 * transactions/budgets/organizations; сам ничего не «придумывает».
 *
 * История — 13 мес (для сезонности нужен тот же месяц год назад). Текущий и
 * предыдущий периоды выделяются из истории по ключу месяца.
 */
export async function getCategorySignals(
  orgId: string,
  asOfInput: Date = new Date(),
  locale: "ru" | "uk" | "en" | "es" = "ru"
): Promise<CategorySignalsResult> {
  const ctx = await getAccountContext(orgId);
  const accountType = ctx?.type ?? "business";
  const currency = ctx?.baseCurrency ?? "EUR";

  // Опорный месяц — последний месяц с транзакциями (не позже asOfInput). Если
  // текущий календарный месяц пуст (данные загружены за прошлые месяцы), берём
  // последний месяц с данными — иначе экран был бы пустым при непустой истории.
  const [latest] = await sql<{ d: Date | null }[]>`
    select max(occurred_at) as d from transactions
    where org_id = ${orgId} and occurred_at <= ${asOfInput} and direction = 'expense'
  `;
  const asOf = latest?.d ? new Date(latest.d) : asOfInput;

  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth();
  const curFrom = new Date(Date.UTC(y, m, 1));
  const curTo = new Date(Date.UTC(y, m + 1, 1));
  const histFrom = new Date(Date.UTC(y, m - 12, 1));

  const history = await loadTransactions(orgId, { from: histFrom, to: curTo });

  const curKey = monthKey(curFrom);
  const prevKey = monthKey(new Date(Date.UTC(y, m - 1, 1)));
  const current = history.filter((t) => monthKey(new Date(t.occurredAt)) === curKey);
  const previous = history.filter((t) => monthKey(new Date(t.occurredAt)) === prevKey);

  // Лимиты бюджетов текущего месяца (таблица budgets), category → limitCents.
  const budgetRows = await sql<{ category: string; amount_cents: string }[]>`
    select category, amount_cents from budgets where org_id = ${orgId} and month = ${curKey}
  `;
  const budgets = new Map(budgetRows.map((r) => [r.category, Number(r.amount_cents)]));

  // Доход/выручка текущего месяца — знаменатель для ratios/бенчмарков.
  const denomCents = computePnL(current).netRevenueCents;

  // Остаток и запас прочности (дни) — для runwayDaysImpact.
  const balanceCents = ctx?.balanceCents ?? undefined;
  let runwayDays: number | undefined;
  if (balanceCents && balanceCents > 0) {
    const since = asOf.getTime() - 90 * DAY;
    const recent = history.filter((t) => new Date(t.occurredAt).getTime() >= since);
    const avgDailyNetCents = Math.round(recent.reduce((s, t) => s + t.netCents, 0) / 90);
    const rw = computeRunway(balanceCents, avgDailyNetCents, asOf);
    if (rw.runwayMonths) runwayDays = Math.round(rw.runwayMonths * 30);
  }

  const signals = computeCategorySignals(
    {
      current,
      previous,
      history,
      budgets,
      accountType,
      incomeCents: accountType === "personal" ? denomCents : undefined,
      revenueCents: accountType === "business" ? denomCents : undefined,
      balanceCents,
      runwayDays,
    },
    { asOf, currency, templates: templatesFor(locale) }
  );

  return { currency, accountType, signals, coverage: categorizationCoverage(current), month: curKey };
}
