import type { NormalizedTransaction } from "@/types";
import { isTransferCategory } from "@/lib/categorize/categories";
import { detectRecurring, merchantKey, type RecurringExpense } from "./recurring";
import { hhi } from "./concentration";
import { categoryLabel as catL } from "@/lib/i18n/categories";
import { currencySymbol } from "@/lib/currency";
import { benchmarkFor } from "./categoryBenchmarks";

/**
 * Category Signals — единый детерминированный слой поверх трат по категориям.
 * Собирает на каждую категорию набор индикаторов и сводит их в
 * статус + одну строку смысла (headline) + предложенное действие (action).
 *
 * Принцип: код считает, ИИ объясняет. Все функции чистые и покрыты тестами.
 * Деньги — в центах. Пороги — конфигурируемы (см. DEFAULT_THRESHOLDS).
 *
 * Фаза 1 покрывает: долю и сдвиг доли (2.1), momentum (2.2),
 * committed-vs-discretionary (2.5), waste (2.11), budget pace (2.8), свод (§3).
 * Поля Фазы 3 (сезонность, волатильность, концентрация, runway, ratios)
 * помечены опциональными и заполняются позже.
 */

export type CategoryStatus = "healthy" | "watch" | "over" | "waste" | "new";

export type BudgetPace = "under" | "ontrack" | "over";

export interface CategoryBudgetSignal {
  limitCents: number;
  spentCents: number;
  projectedCents: number;
  pace: BudgetPace;
  overrunCents: number; // прогноз перерасхода к концу месяца (>=0)
}

export interface CategorySignal {
  category: string;
  totalCents: number;

  // ── Доля и сдвиг (2.1) ────────────────────────────────────────
  sharePct: number; // доля в тратах текущего периода
  shareDeltaPp: number; // сдвиг доли к пред. периоду, проц. пункты

  // ── Тренд и импульс (2.2) ─────────────────────────────────────
  momPct: number | null; // изм. суммы к прошлому месяцу, %
  trend3m: "rising" | "stable" | "falling"; // наклон по последним 3 мес

  // ── Обязательное vs дискреционное (2.5) ───────────────────────
  committedCents: number; // регулярная часть (совпало с recurring)
  discretionaryCents: number; // остальное (можно резать)
  committedPct: number;

  // ── Отходы / зомби (2.11) ─────────────────────────────────────
  wasteCents: number; // регулярка без признаков использования (stale)

  // ── Бюджет (2.8) ──────────────────────────────────────────────
  budget?: CategoryBudgetSignal;

  // ── Свод (§3) ─────────────────────────────────────────────────
  status: CategoryStatus;
  headline: string;
  action: string | null;

  /** Помесячные суммы за последние 6 мес — для мини-спарклайна в UI. */
  sparkline: number[];

  // ── Фаза 3 (заполняется позже) ────────────────────────────────
  seasonalIndex?: number | null;
  volatility?: number;
  vendorTopSharePct?: number;
  vendorHHI?: number;
  newVendors?: number;
  anomalyCount?: number;
  incomeRatioPct?: number;
  revenueRatioPct?: number;
  runwayDaysImpact?: number;
}

export interface CategorySignalsInput {
  /** Текущий период (например, текущий месяц). */
  current: NormalizedTransaction[];
  /** Предыдущий период той же длины — для сдвига доли и momPct. */
  previous?: NormalizedTransaction[];
  /** История 6–12 мес (включая текущий) — для тренда/сезонности/волатильности. */
  history?: NormalizedTransaction[];
  /** Готовые регулярные списания; если не заданы — посчитаем из history/current. */
  recurring?: RecurringExpense[];
  /** category → limitCents (таблица budgets / targets). */
  budgets?: Map<string, number>;
  incomeCents?: number; // личное
  revenueCents?: number; // бизнес
  balanceCents?: number; // для runwayDaysImpact
  runwayDays?: number; // текущий запас прочности в днях (для runwayDaysImpact)
  accountType?: "business" | "personal"; // для ratios/бенчмарков
}

export interface SignalThresholds {
  /** ±% наклона регрессии, внутри которого тренд считается "stable". */
  trendStablePct: number;
  /** watch: рост тренда + сдвиг доли ≥ этого (проц. пункты). */
  watchShareDeltaPp: number;
  /** waste-статус: минимальная доля waste в категории (0..1). */
  wasteShareMin: number;
  /** waste-статус: минимальная абсолютная сумма waste, центы. */
  wasteMinCents: number;
  /** budget over: во сколько раз темп может превышать линейный до "over". */
  budgetOverFactor: number;
  /** budget under: ниже какой доли линейного темпа — "under". */
  budgetUnderFactor: number;
  /** сезонность: индекс ≤ этого считается «как обычно» и гасит watch (§2.3). */
  seasonalNormalMax: number;
}

export const DEFAULT_THRESHOLDS: SignalThresholds = {
  trendStablePct: 5,
  watchShareDeltaPp: 3,
  wasteShareMin: 0.15,
  wasteMinCents: 500,
  budgetOverFactor: 1.08,
  budgetUnderFactor: 0.92,
  seasonalNormalMax: 1.3,
};

export interface SignalTemplates {
  headline: Record<CategoryStatus, (s: CategorySignal, cur: string) => string>;
  action: Record<CategoryStatus, (s: CategorySignal) => string | null>;
}

// ── Утилиты ─────────────────────────────────────────────────────

const EXPENSE_FALLBACK = "Uncategorized";

function isSpend(t: NormalizedTransaction): boolean {
  return t.direction === "expense" && t.kind !== "fee" && !isTransferCategory(t.category);
}

function categoryOf(t: NormalizedTransaction): string {
  return t.category ?? EXPENSE_FALLBACK;
}

/** Сумма трат по категориям (тот же group-by, что в engine, но без fee). */
function totalsByCategory(txns: NormalizedTransaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (!isSpend(t)) continue;
    const cat = categoryOf(t);
    map.set(cat, (map.get(cat) ?? 0) + t.grossCents);
  }
  return map;
}

function sum(map: Map<string, number>): number {
  let s = 0;
  for (const v of map.values()) s += v;
  return s;
}

/** Ключ месяца "YYYY-MM" в UTC. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Помесячные суммы одной категории из истории, в хронологическом порядке. */
function monthlySeries(history: NormalizedTransaction[], category: string): number[] {
  const byMonth = new Map<string, number>();
  for (const t of history) {
    if (!isSpend(t)) continue;
    if (categoryOf(t) !== category) continue;
    const k = monthKey(t.occurredAt);
    byMonth.set(k, (byMonth.get(k) ?? 0) + t.grossCents);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

/**
 * Знак наклона линейной регрессии по последним n точкам, нормированный к среднему.
 * Возвращает наклон в % от среднего за шаг; null если точек < 2 или среднее 0.
 */
function trendSlopePct(series: number[], n = 3): number | null {
  const pts = series.slice(-n);
  if (pts.length < 2) return null;
  const N = pts.length;
  const meanX = (N - 1) / 2;
  const meanY = pts.reduce((s, v) => s + v, 0) / N;
  if (meanY === 0) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < N; i++) {
    num += (i - meanX) * (pts[i]! - meanY);
    den += (i - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den; // центы за месяц
  return (slope / meanY) * 100;
}

// ── Committed vs discretionary (2.5) ────────────────────────────

/**
 * В категории делим траты на committed (мерчант совпал с регулярным списанием)
 * и discretionary (остальное). Сопоставление по merchantKey.
 */
function splitCommitted(
  current: NormalizedTransaction[],
  category: string,
  recurringKeys: Set<string>
): { committedCents: number; discretionaryCents: number } {
  let committedCents = 0;
  let discretionaryCents = 0;
  for (const t of current) {
    if (!isSpend(t)) continue;
    if (categoryOf(t) !== category) continue;
    if (recurringKeys.has(merchantKey(t.description))) committedCents += t.grossCents;
    else discretionaryCents += t.grossCents;
  }
  return { committedCents, discretionaryCents };
}

// ── Фаза 3: сезонность, волатильность, концентрация, creep, runway ──

/** Помесячные суммы категории с ключами месяца. */
function monthlyMap(history: NormalizedTransaction[], category: string): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const t of history) {
    if (!isSpend(t)) continue;
    if (categoryOf(t) !== category) continue;
    const k = monthKey(t.occurredAt);
    byMonth.set(k, (byMonth.get(k) ?? 0) + t.grossCents);
  }
  return byMonth;
}

/** Сдвиг ключа месяца на -12 мес (тот же месяц год назад). */
function monthKeyYearAgo(asOf: Date): string {
  return monthKey(new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), 1)));
}

/**
 * Сезонный индекс (2.3): трата этот месяц / трата тот же месяц год назад.
 * 1.0 = как обычно, 1.8 = на 80% выше сезонной нормы. Нужна история ≥13 мес.
 */
function seasonalIndex(monthly: Map<string, number>, asOf: Date): number | null {
  const cur = monthly.get(monthKey(asOf));
  const yearAgo = monthly.get(monthKeyYearAgo(asOf));
  if (cur == null || yearAgo == null || yearAgo === 0) return null;
  return Math.round((cur / yearAgo) * 100) / 100;
}

/** Волатильность (2.4): коэффициент вариации CV = stdev/mean месячных сумм. */
function volatility(series: number[]): number {
  if (series.length < 2) return 0;
  const mean = series.reduce((s, v) => s + v, 0) / series.length;
  if (mean === 0) return 0;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length;
  return Math.round((Math.sqrt(variance) / mean) * 100) / 100;
}

/** Концентрация по мерчантам внутри категории (2.6): доля топ-мерчанта + HHI. */
function vendorConcentration(
  current: NormalizedTransaction[],
  category: string
): { vendorTopSharePct: number; vendorHHI: number } {
  const byVendor = new Map<string, number>();
  let total = 0;
  for (const t of current) {
    if (!isSpend(t)) continue;
    if (categoryOf(t) !== category) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    byVendor.set(key, (byVendor.get(key) ?? 0) + t.grossCents);
    total += t.grossCents;
  }
  if (total === 0 || byVendor.size === 0) return { vendorTopSharePct: 0, vendorHHI: 0 };
  const shares = [...byVendor.values()].map((v) => v / total);
  const top = Math.max(...shares);
  return {
    vendorTopSharePct: Math.round(top * 1000) / 10,
    vendorHHI: Math.round(hhi(shares) * 1000) / 1000,
  };
}

/** Новые мерчанты в категории (2.7): ключи, которых не было в истории. */
function newVendorCount(
  current: NormalizedTransaction[],
  category: string,
  historyKeys: Set<string>
): number {
  const seen = new Set<string>();
  for (const t of current) {
    if (!isSpend(t)) continue;
    if (categoryOf(t) !== category) continue;
    const key = merchantKey(t.description);
    if (key && !historyKeys.has(key)) seen.add(key);
  }
  return seen.size;
}

// ── Budget pace (2.8) ───────────────────────────────────────────

function computeBudgetSignal(
  spentCents: number,
  limitCents: number,
  elapsed: number,
  th: SignalThresholds
): CategoryBudgetSignal {
  const safeElapsed = Math.min(1, Math.max(0.0001, elapsed));
  const projectedCents = Math.round(spentCents / safeElapsed);
  const expectedCents = limitCents * safeElapsed;

  let pace: BudgetPace = "ontrack";
  if (spentCents > limitCents) pace = "over";
  else if (spentCents > expectedCents * th.budgetOverFactor) pace = "over";
  else if (spentCents < expectedCents * th.budgetUnderFactor) pace = "under";

  const overrunCents = Math.max(0, projectedCents - limitCents);
  return { limitCents, spentCents, projectedCents, pace, overrunCents };
}

/** Доля прошедших дней месяца по дате asOf (для linear pacing). */
export function monthElapsedFraction(asOf: Date): number {
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.min(1, Math.max(0, asOf.getUTCDate() / daysInMonth));
}

// ── Шаблоны headline/action (i18n-ready, дефолт RU) ─────────────

function fmtMoney(cents: number, currency: string): string {
  const v = Math.round(cents / 100);
  return `${currencySymbol(currency)}${v}`;
}

/** Шаблоны по локали интерфейса; категория внутри строки тоже локализуется. */
export function templatesFor(locale: "ru" | "uk" | "en" | "es"): SignalTemplates {
  if (locale === "uk") {
    return {
      headline: {
        waste: (s, cur) => `${fmtMoney(s.wasteCents, cur)}/міс марно у «${catL(s.category, locale)}» (регулярний платіж без користі)`,
        over: (s, cur) => {
          if (s.budget) return `За таким темпом перевищиш ліміт «${catL(s.category, locale)}» на ${fmtMoney(s.budget.overrunCents, cur)}`;
          const ratio = s.incomeRatioPct ?? s.revenueRatioPct;
          return ratio != null
            ? `«${catL(s.category, locale)}» — ${Math.round(ratio)}% доходу, вище здорової норми`
            : `«${catL(s.category, locale)}» перевищує здоровий рівень`;
        },
        watch: (s) =>
          `«${catL(s.category, locale)}» ${s.momPct != null && s.momPct > 0 ? `+${Math.round(s.momPct)}%` : "зростає"}` +
          (s.shareDeltaPp >= 0.5 ? ` та +${s.shareDeltaPp.toFixed(1)}пп частки` : ""),
        new: (s, cur) => `Нова стаття «${catL(s.category, locale)}»: ${fmtMoney(s.totalCents, cur)}`,
        healthy: (s) => `«${catL(s.category, locale)}» у нормі`,
      },
      action: {
        waste: () => "Скасувати невикористовуване",
        over: () => "Підняти ліміт або урізати",
        watch: () => "Встановити ліміт",
        new: () => "Перевірити категорію",
        healthy: () => null,
      },
    };
  }
  if (locale === "en") {
    return {
      headline: {
        waste: (s, cur) => `${fmtMoney(s.wasteCents, cur)}/mo wasted in “${catL(s.category, locale)}” (unused recurring)`,
        over: (s, cur) => {
          if (s.budget) return `On pace to exceed the “${catL(s.category, locale)}” limit by ${fmtMoney(s.budget.overrunCents, cur)}`;
          const ratio = s.incomeRatioPct ?? s.revenueRatioPct;
          return ratio != null
            ? `“${catL(s.category, locale)}” is ${Math.round(ratio)}% of income — above the healthy range`
            : `“${catL(s.category, locale)}” exceeds the healthy level`;
        },
        watch: (s) =>
          `“${catL(s.category, locale)}” ${s.momPct != null && s.momPct > 0 ? `+${Math.round(s.momPct)}%` : "is rising"}` +
          (s.shareDeltaPp >= 0.5 ? ` and +${s.shareDeltaPp.toFixed(1)}pp of share` : ""),
        new: (s, cur) => `New category “${catL(s.category, locale)}”: ${fmtMoney(s.totalCents, cur)}`,
        healthy: (s) => `“${catL(s.category, locale)}” is healthy`,
      },
      action: {
        waste: () => "Cancel unused",
        over: () => "Raise the limit or cut back",
        watch: () => "Set a limit",
        new: () => "Review the category",
        healthy: () => null,
      },
    };
  }
  if (locale === "es") {
    return {
      headline: {
        waste: (s, cur) => `${fmtMoney(s.wasteCents, cur)}/mes desperdiciados en «${catL(s.category, locale)}» (recurrente sin uso)`,
        over: (s, cur) => {
          if (s.budget) return `Al ritmo actual superarás el límite de «${catL(s.category, locale)}» en ${fmtMoney(s.budget.overrunCents, cur)}`;
          const ratio = s.incomeRatioPct ?? s.revenueRatioPct;
          return ratio != null
            ? `«${catL(s.category, locale)}» es ${Math.round(ratio)}% del ingreso — por encima de lo sano`
            : `«${catL(s.category, locale)}» supera el nivel saludable`;
        },
        watch: (s) =>
          `«${catL(s.category, locale)}» ${s.momPct != null && s.momPct > 0 ? `+${Math.round(s.momPct)}%` : "está subiendo"}` +
          (s.shareDeltaPp >= 0.5 ? ` y +${s.shareDeltaPp.toFixed(1)}pp de cuota` : ""),
        new: (s, cur) => `Categoría nueva «${catL(s.category, locale)}»: ${fmtMoney(s.totalCents, cur)}`,
        healthy: (s) => `«${catL(s.category, locale)}» está en orden`,
      },
      action: {
        waste: () => "Cancelar lo no usado",
        over: () => "Subir el límite o recortar",
        watch: () => "Poner un límite",
        new: () => "Revisar la categoría",
        healthy: () => null,
      },
    };
  }
  return DEFAULT_TEMPLATES;
}

export const DEFAULT_TEMPLATES: SignalTemplates = {
  headline: {
    waste: (s, cur) =>
      `${fmtMoney(s.wasteCents, cur)}/мес впустую в «${s.category}» (неиспользуемая регулярка)`,
    over: (s, cur) => {
      if (s.budget) {
        return `По темпу выйдешь за лимит «${s.category}» на ${fmtMoney(s.budget.overrunCents, cur)}`;
      }
      const ratio = s.incomeRatioPct ?? s.revenueRatioPct;
      return ratio != null
        ? `«${s.category}» ${Math.round(ratio)}% дохода — выше здоровой нормы`
        : `«${s.category}» превышает здоровый уровень`;
    },
    watch: (s) =>
      `«${s.category}» ${s.momPct != null && s.momPct > 0 ? `+${Math.round(s.momPct)}%` : "растёт"}` +
      (s.shareDeltaPp >= 0.5 ? ` и +${s.shareDeltaPp.toFixed(1)}пп доли` : ""),
    new: (s, cur) => `Новая статья «${s.category}»: ${fmtMoney(s.totalCents, cur)}`,
    healthy: (s) => `«${s.category}» в норме`,
  },
  action: {
    waste: () => "Отменить неиспользуемое",
    over: () => "Поднять лимит или урезать",
    watch: () => "Установить лимит",
    new: () => "Проверить категорию",
    healthy: () => null,
  },
};

// ── Свод в статус (§3) ──────────────────────────────────────────

function rollUpStatus(
  s: CategorySignal,
  ctx: { isNew: boolean; overBenchmark: boolean; seasonal: boolean },
  th: SignalThresholds
): CategoryStatus {
  const wasteSignificant =
    s.wasteCents >= th.wasteMinCents &&
    s.totalCents > 0 &&
    s.wasteCents / s.totalCents >= th.wasteShareMin;
  if (wasteSignificant) return "waste";

  // over: превышение темпа бюджета ИЛИ выход за здоровый коридор доли (§2.9).
  if (s.budget?.pace === "over" || ctx.overBenchmark) return "over";

  // Сезонность гасит ложную тревогу: рост «как обычно в этом месяце» — не watch.
  const rising = s.trend3m === "rising" && !ctx.seasonal;
  const anomalies = s.anomalyCount ?? 0;
  const newVendors = s.newVendors ?? 0;
  if (
    (rising && s.shareDeltaPp >= th.watchShareDeltaPp) ||
    anomalies > 0 ||
    newVendors > 0
  ) {
    return "watch";
  }

  if (ctx.isNew) return "new";
  return "healthy";
}

// ── Главная функция ─────────────────────────────────────────────

export function computeCategorySignals(
  input: CategorySignalsInput,
  opts: {
    thresholds?: Partial<SignalThresholds>;
    templates?: SignalTemplates;
    asOf?: Date;
    currency?: string;
  } = {}
): CategorySignal[] {
  const th = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };
  const tpl = opts.templates ?? DEFAULT_TEMPLATES;
  const asOf = opts.asOf ?? new Date();

  const { current, previous = [], history = [], budgets } = input;
  const accountType = input.accountType ?? "business";
  const denomCents = accountType === "personal" ? input.incomeCents : input.revenueCents;
  const currency = opts.currency ?? current[0]?.currency ?? "EUR";

  const curTotals = totalsByCategory(current);
  const prevTotals = totalsByCategory(previous);
  const curTotal = sum(curTotals);
  const prevTotal = sum(prevTotals);

  // Регулярные списания: из history (шире → надёжнее), иначе из current.
  const recurring =
    input.recurring ?? detectRecurring(history.length ? history : current, { asOf: asOf.getTime() });
  const recurringKeys = new Set(recurring.map((r) => merchantKey(r.merchant)));

  // Категории и ключи мерчантов из истории (для флагов "new" и creep).
  const historyCats = new Set<string>();
  const historyVendorKeys = new Set<string>();
  for (const t of history) {
    if (!isSpend(t)) continue;
    historyCats.add(categoryOf(t));
    const k = merchantKey(t.description);
    if (k) historyVendorKeys.add(k);
  }

  const out: CategorySignal[] = [];
  for (const [category, totalCents] of curTotals) {
    const prevCents = prevTotals.get(category) ?? 0;

    const sharePct = curTotal > 0 ? (totalCents / curTotal) * 100 : 0;
    const prevSharePct = prevTotal > 0 ? (prevCents / prevTotal) * 100 : 0;
    const shareDeltaPp = Math.round((sharePct - prevSharePct) * 10) / 10;

    const momPct = prevCents > 0 ? Math.round(((totalCents - prevCents) / prevCents) * 1000) / 10 : null;

    const series = monthlySeries(history, category);
    const slope = trendSlopePct(series);
    const trend3m: CategorySignal["trend3m"] =
      slope == null || Math.abs(slope) < th.trendStablePct
        ? "stable"
        : slope > 0
          ? "rising"
          : "falling";

    // ── Фаза 3 ──────────────────────────────────────────────────
    const season = seasonalIndex(monthlyMap(history, category), asOf);
    const vol = volatility(series);
    const { vendorTopSharePct, vendorHHI } = vendorConcentration(current, category);
    const newVendors = newVendorCount(current, category, historyVendorKeys);
    const runwayDaysImpact =
      input.balanceCents && input.balanceCents > 0 && input.runwayDays && input.runwayDays > 0
        ? Math.round((totalCents * input.runwayDays) / input.balanceCents * 10) / 10
        : undefined;
    const ratioPct =
      denomCents && denomCents > 0 ? Math.round((totalCents / denomCents) * 1000) / 10 : undefined;
    const bench = benchmarkFor(accountType, category);
    const overBenchmark = ratioPct != null && bench != null && ratioPct > bench.healthyMaxPct;
    const seasonalNormal = season != null && season <= th.seasonalNormalMax;

    const { committedCents, discretionaryCents } = splitCommitted(current, category, recurringKeys);
    const committedPct = totalCents > 0 ? Math.round((committedCents / totalCents) * 100) : 0;

    // waste: регулярные списания в этой категории, помеченные stale.
    const wasteCents = recurring
      .filter((r) => r.stale && (r.category ?? EXPENSE_FALLBACK) === category)
      .reduce((s, r) => s + r.monthlyEstimateCents, 0);

    let budget: CategoryBudgetSignal | undefined;
    const limitCents = budgets?.get(category);
    if (limitCents != null && limitCents > 0) {
      budget = computeBudgetSignal(totalCents, limitCents, monthElapsedFraction(asOf), th);
    }

    const isNew = history.length > 0 && !historyCats.has(category) && prevCents === 0;

    const signal: CategorySignal = {
      category,
      totalCents,
      sharePct: Math.round(sharePct * 10) / 10,
      shareDeltaPp,
      momPct,
      trend3m,
      committedCents,
      discretionaryCents,
      committedPct,
      wasteCents,
      budget,
      status: "healthy",
      headline: "",
      action: null,
      sparkline: series.slice(-6),
      seasonalIndex: season,
      volatility: vol,
      vendorTopSharePct,
      vendorHHI,
      newVendors,
      ...(runwayDaysImpact != null ? { runwayDaysImpact } : {}),
      ...(ratioPct != null && accountType === "personal" ? { incomeRatioPct: ratioPct } : {}),
      ...(ratioPct != null && accountType === "business" ? { revenueRatioPct: ratioPct } : {}),
    };

    signal.status = rollUpStatus(signal, { isNew, overBenchmark, seasonal: seasonalNormal }, th);
    signal.headline = tpl.headline[signal.status](signal, currency);
    signal.action = tpl.action[signal.status](signal);

    out.push(signal);
  }

  return out.sort((a, b) => b.totalCents - a.totalCents);
}

export interface CategorizationCoverage {
  totalCents: number; // все траты периода (без переводов/комиссий)
  uncategorizedCents: number; // траты без категории
  uncategorizedCount: number;
  uncategorizedRatePct: number; // доля сумм без категории (KPI качества данных, §4.6)
}

/**
 * KPI покрытия категоризацией: какая доля трат осталась без категории.
 * Питает нудж «уточни N транзакций» и служит индикатором качества данных,
 * от которого зависит точность всех сигналов §2.
 */
export function categorizationCoverage(txns: NormalizedTransaction[]): CategorizationCoverage {
  let totalCents = 0;
  let uncategorizedCents = 0;
  let uncategorizedCount = 0;
  for (const t of txns) {
    if (!isSpend(t)) continue;
    totalCents += t.grossCents;
    const cat = t.category?.trim();
    if (!cat || cat === EXPENSE_FALLBACK) {
      uncategorizedCents += t.grossCents;
      uncategorizedCount += 1;
    }
  }
  const uncategorizedRatePct =
    totalCents > 0 ? Math.round((uncategorizedCents / totalCents) * 1000) / 10 : 0;
  return { totalCents, uncategorizedCents, uncategorizedCount, uncategorizedRatePct };
}

/** Категории со статусом ≠ healthy — для сигнальной ленты. */
export function watchSignals(signals: CategorySignal[]): CategorySignal[] {
  const rank: Record<CategoryStatus, number> = { waste: 0, over: 1, watch: 2, new: 3, healthy: 4 };
  return signals
    .filter((s) => s.status !== "healthy")
    .sort((a, b) => rank[a.status] - rank[b.status] || b.totalCents - a.totalCents);
}
