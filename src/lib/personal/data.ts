import { sql } from "@/lib/db";
import { loadTransactions } from "@/lib/transactions";
import { getAccountContext } from "@/lib/account/context";
import { computeIncomeProfile } from "@/lib/metrics/income";
import { detectRecurring } from "@/lib/metrics/recurring";
import { merchantKey } from "@/lib/merchants";
import { isTransferCategory } from "@/lib/categorize/categories";
import { nextDueDate } from "@/lib/metrics/calendar";
import { getRates, convertCents } from "@/lib/fx";
import { computeSafeToSpend, type SafeToSpend } from "@/lib/metrics/safeToSpend";
import { computeBudgetStatus, type BudgetLine } from "@/lib/metrics/budgets";
import { computeSavings, type Savings } from "@/lib/metrics/savings";
import { expensesByCategory, incomeSources } from "@/lib/metrics/engine";
import { computeUpcomingBills, subscriptionSummary, manualSubsByCategory, nextDueAfter, type UpcomingBill, type SubscriptionSummary } from "@/lib/metrics/bills";
import { expandPlanned, plannedNetCents } from "@/lib/metrics/planned";
import { loadPlannedItems } from "@/lib/planned/load";
import { computeNetWorth, type NetWorth, type AccountBalance } from "@/lib/metrics/networth";
import type { RecurringExpense } from "@/lib/metrics/recurring";
import type { AccountContext } from "@/lib/account/context";

const DAY = 86_400_000;

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Ближайшая дата дня месяца `day` (1..31) строго после asOf; клампится под короткие месяцы. */
function nextPaydayFromDay(day: number, asOf: Date): Date {
  const at = (y: number, m: number) => {
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, dim), 12));
  };
  const cand = at(asOf.getUTCFullYear(), asOf.getUTCMonth());
  if (cand.getTime() > asOf.getTime()) return cand;
  const m = asOf.getUTCMonth();
  return at(m === 11 ? asOf.getUTCFullYear() + 1 : asOf.getUTCFullYear(), (m + 1) % 12);
}

/**
 * Период Safe-to-Spend и дата зарплаты для показа:
 * 1) задан день зарплаты вручную → следующая эта дата;
 * 2) доход введён руками (реальный день неизвестен) → до конца месяца, без даты;
 * 3) иначе → авто-детект из транзакций (или конец месяца, если не нашли).
 */
function resolvePayday(
  ctx: Pick<AccountContext, "paydayDay" | "salaryCents" | "extraIncomeCents">,
  detected: Date | null,
  asOf: Date
): { payday: Date | null; periodEnd: Date } {
  if (ctx.paydayDay != null) {
    const p = nextPaydayFromDay(ctx.paydayDay, asOf);
    return { payday: p, periodEnd: p };
  }
  const manualIncome = (ctx.salaryCents ?? 0) > 0 || (ctx.extraIncomeCents ?? 0) > 0;
  if (manualIncome) return { payday: null, periodEnd: endOfMonth(asOf) };
  return { payday: detected, periodEnd: detected ?? endOfMonth(asOf) };
}

/** Дефолт режима трат: доход есть, но режим не выбран → «Норма» 70% (не от остатка). */
function effectiveSpendPct(ctx: Pick<AccountContext, "spendTargetPct">, monthlyIncomeCents: number): number | null {
  return ctx.spendTargetPct ?? (monthlyIncomeCents > 0 ? 70 : null);
}

/** Потрачено в календарном месяце asOf: траты без комиссий и внутренних переводов. */
function spentInMonth(txns: Awaited<ReturnType<typeof loadTransactions>>, asOf: Date): number {
  const from = startOfMonth(asOf).getTime();
  const to = endOfMonth(asOf).getTime();
  let s = 0;
  for (const t of txns) {
    if (t.direction !== "expense" || t.kind === "fee") continue;
    if (isTransferCategory(t.category)) continue;
    const ts = t.occurredAt.getTime();
    if (ts >= from && ts < to) s += t.grossCents;
  }
  return s;
}

/** Месячный доход: регулярный (зарплата) либо факт текущего месяца. */
function monthlyIncomeOf(
  txns: Awaited<ReturnType<typeof loadTransactions>>,
  recurringIncomeCents: number,
  asOf: Date
): number {
  if (recurringIncomeCents > 0) return recurringIncomeCents;
  const from = startOfMonth(asOf).getTime();
  const to = endOfMonth(asOf).getTime();
  let s = 0;
  for (const t of txns) {
    if (t.direction !== "income" || t.kind === "fee") continue;
    const ts = t.occurredAt.getTime();
    if (ts >= from && ts < to) s += t.grossCents;
  }
  return s;
}

/**
 * Доход для плана трат: руками заданные зарплата + доп. доходы имеют приоритет
 * (человек без банка знает свой доход лучше детектора); иначе — автодетект.
 */
function resolveMonthlyIncome(
  ctx: Pick<AccountContext, "salaryCents" | "extraIncomeCents">,
  txns: Awaited<ReturnType<typeof loadTransactions>>,
  recurringIncomeCents: number,
  asOf: Date
): number {
  const manual = (ctx.salaryCents ?? 0) + (ctx.extraIncomeCents ?? 0);
  if (manual > 0) return manual;
  return monthlyIncomeOf(txns, recurringIncomeCents, asOf);
}

/**
 * Ожидаемый отток до конца периода: берём МАКСИМУМ из
 *  (а) средних трат по истории × дней осталось (обычные ежедневные расходы),
 *  (б) обнаруженных крупных регулярных списаний до конца периода.
 * Так safe-to-spend не завышается — учитывает, что ты продолжишь тратить как обычно.
 */
function expectedOutflowCents(
  histTxns: Awaited<ReturnType<typeof loadTransactions>>,
  recurring: RecurringExpense[],
  asOf: Date,
  periodEnd: Date
): number {
  const daysLeft = Math.max(1, Math.ceil((periodEnd.getTime() - asOf.getTime()) / DAY));

  const winStart = asOf.getTime() - 60 * DAY;
  let exp60 = 0;
  for (const t of histTxns) {
    if (t.direction !== "expense" || t.kind === "fee") continue;
    const ts = t.occurredAt.getTime();
    if (ts >= winStart && ts <= asOf.getTime()) exp60 += t.grossCents;
  }
  const expectedRegularSpend = Math.round((exp60 / 60) * daysLeft);

  let committed = 0;
  for (const r of recurring) {
    const due = nextDueDate(r.lastChargeAt, r.cadence, asOf);
    if (due >= asOf && due <= periodEnd) committed += r.avgAmountCents;
  }

  return Math.max(expectedRegularSpend, committed);
}

/**
 * Ключи авто-платежей, скрытых пользователем (ложные срабатывания детектора).
 * Применяется ко ВСЕМ местам, где показываются/учитываются регулярные списания:
 * обзор, календарь, safe-to-spend, чат.
 */
export async function loadHiddenBillKeys(orgId: string): Promise<Set<string>> {
  const rows = await sql<{ match_key: string }[]>`
    select match_key from hidden_subscriptions where org_id = ${orgId}
  `;
  return new Set(rows.map((r) => r.match_key));
}

/** Убирает скрытые авто-платежи и проставляет matchKey (для кнопки «скрыть» в UI). */
export function filterHiddenRecurring(
  recurring: RecurringExpense[],
  hidden: Set<string>
): RecurringExpense[] {
  return recurring
    .map((r) => ({ ...r, matchKey: r.matchKey ?? merchantKey(r.merchant) }))
    .filter((r) => !hidden.has(r.matchKey!));
}

/** Месячный доход организации (ручной зарплата+доп либо автодетект) — база плана трат. */
export async function getMonthlyIncome(orgId: string, asOf: Date = new Date()): Promise<number> {
  const ctx = await getAccountContext(orgId);
  const manual = (ctx?.salaryCents ?? 0) + (ctx?.extraIncomeCents ?? 0);
  if (manual > 0) return manual;
  const txns = await loadTransactions(orgId, {
    from: new Date(asOf.getTime() - 120 * DAY),
    to: new Date(asOf.getTime() + DAY),
  });
  const income = computeIncomeProfile(txns, { asOf });
  return monthlyIncomeOf(txns, income.recurringIncomeCents, asOf);
}

/** Собирает входы Safe-to-Spend из БД и считает результат детерминированной функцией. */
export async function getSafeToSpend(orgId: string, asOf: Date = new Date()): Promise<SafeToSpend | null> {
  const ctx = await getAccountContext(orgId);
  if (!ctx) return null;

  const from = new Date(asOf.getTime() - 120 * DAY);
  const to = new Date(asOf.getTime() + 45 * DAY);
  const txns = await loadTransactions(orgId, { from, to });

  const income = computeIncomeProfile(txns, { asOf });
  const { periodEnd } = resolvePayday(ctx, income.nextPayday, asOf);
  const recurring = filterHiddenRecurring(
    detectRecurring(txns, { asOf: asOf.getTime() }),
    await loadHiddenBillKeys(orgId)
  );

  // Плановые операции до конца периода — учитываем как доп. отток/приток.
  const planned = plannedNetCents(expandPlanned(await loadPlannedItems(orgId), asOf, periodEnd));

  const monthlyIncomeCents = resolveMonthlyIncome(ctx, txns, income.recurringIncomeCents, asOf);
  return computeSafeToSpend({
    balanceCents: ctx.balanceCents ?? 0,
    expectedIncomeRemainingCents: income.expectedRemainingCents + planned.plannedIncomeCents,
    committedBillsCents: expectedOutflowCents(txns, recurring, asOf, periodEnd) + planned.plannedExpenseCents,
    budgetReservesCents: 0,
    bufferCents: ctx.bufferCents ?? 0,
    periodEnd,
    asOf,
    monthlyIncomeCents,
    spendTargetPct: effectiveSpendPct(ctx, monthlyIncomeCents),
    spentThisMonthCents: spentInMonth(txns, asOf),
  });
}

export interface PersonalOverview {
  ctx: AccountContext;
  savings: Savings;
  sts: SafeToSpend;
  nextPayday: Date | null;
  breakdown: { category: string; totalCents: number }[];
  /** Разбивка дохода по источникам из фактических поступлений (сумма ≈ savings.incomeCents). */
  incomeBreakdown: { description: string | null; category: string | null; totalCents: number }[];
  bills: UpcomingBill[];
  currency: string;
  /** Месяц, за который показаны доход/траты/разбивка (последний с данными). */
  reportMonth: Date;
}

/** Начало последнего месяца с расходами (≤ asOf); null если данных нет. */
async function latestExpenseMonthStart(orgId: string, asOf: Date): Promise<Date | null> {
  const [row] = await sql<{ d: Date | null }[]>`
    select max(occurred_at) as d from transactions
    where org_id = ${orgId} and occurred_at <= ${asOf} and direction = 'expense'
  `;
  if (!row?.d) return null;
  const d = new Date(row.d);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Единый бандл для личного обзора: одна загрузка истории, всё посчитано. */
export async function getPersonalOverview(orgId: string, asOf: Date = new Date()): Promise<PersonalOverview | null> {
  const ctx = await getAccountContext(orgId);
  if (!ctx) return null;
  await materializeManualSubscriptions(orgId);

  // Ретроспективные KPI (доход/траты/разбивка) — за последний месяц с данными,
  // иначе в начале месяца без операций всё было бы по нулям. Safe-to-spend
  // остаётся на «сейчас» — это про деньги до следующей зарплаты.
  const curMonthStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const monthStart = (await latestExpenseMonthStart(orgId, asOf)) ?? curMonthStart;
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const histFrom = new Date(asOf.getTime() - 120 * DAY);
  const histTo = new Date(asOf.getTime() + 45 * DAY);

  const [monthTxns, histTxns] = await Promise.all([
    loadTransactions(orgId, { from: monthStart, to: monthEnd }),
    loadTransactions(orgId, { from: histFrom, to: histTo }),
  ]);

  const savings = computeSavings(monthTxns);
  const income = computeIncomeProfile(histTxns, { asOf });
  const { payday, periodEnd } = resolvePayday(ctx, income.nextPayday, asOf);

  const recurring = filterHiddenRecurring(
    detectRecurring(histTxns, { asOf: asOf.getTime() }),
    await loadHiddenBillKeys(orgId)
  );
  const planned = plannedNetCents(expandPlanned(await loadPlannedItems(orgId), asOf, periodEnd));

  const monthlyIncomeCents = resolveMonthlyIncome(ctx, histTxns, income.recurringIncomeCents, asOf);
  const sts = computeSafeToSpend({
    balanceCents: ctx.balanceCents ?? 0,
    expectedIncomeRemainingCents: income.expectedRemainingCents + planned.plannedIncomeCents,
    committedBillsCents: expectedOutflowCents(histTxns, recurring, asOf, periodEnd) + planned.plannedExpenseCents,
    budgetReservesCents: 0,
    bufferCents: ctx.bufferCents ?? 0,
    periodEnd,
    asOf,
    monthlyIncomeCents,
    spendTargetPct: effectiveSpendPct(ctx, monthlyIncomeCents),
    spentThisMonthCents: spentInMonth(histTxns, asOf),
  });

  const breakdown = expensesByCategory(monthTxns).map((e) => ({ category: e.category, totalCents: e.totalCents }));
  const incomeBreakdown = incomeSources(monthTxns);
  // Ручные подписки показываем в «Ближайших счетах» наравне с авто-найденными.
  const manualRec = await loadManualRecurring(orgId, asOf);
  const bills = computeUpcomingBills([...recurring, ...manualRec], { horizonDays: 30, asOf });

  return { ctx, savings, sts, nextPayday: payday, breakdown, incomeBreakdown, bills, currency: ctx.baseCurrency, reportMonth: monthStart };
}

export interface SubscriptionsData {
  recurring: RecurringExpense[];
  summary: SubscriptionSummary;
  currency: string;
  /** Ключи авто-подписок, скрытых пользователем (можно вернуть через UI). */
  hidden: string[];
}

/**
 * Материализация ручных подписок: наступила дата списания → создаём РЕАЛЬНУЮ
 * операцию (source='manual', идемпотентный external_id `msub-{id}-{дата}`)
 * и двигаем next_due на следующий период. Так «указанные подписки» реально
 * попадают в траты, KPI и конверты. Вызывается лениво при загрузке данных.
 */
export async function materializeManualSubscriptions(orgId: string, today: Date = new Date()): Promise<number> {
  const todayIso = today.toISOString().slice(0, 10);
  const due = await sql<{ id: string; name: string; amount_cents: string; cadence: string; currency: string; next_due: string; category: string | null }[]>`
    select id, name, amount_cents, cadence, currency, next_due::text as next_due, category
    from manual_subscriptions
    where org_id = ${orgId} and next_due is not null and next_due <= ${todayIso}
  `;
  let created = 0;
  for (const s of due) {
    const cadence = s.cadence === "weekly" ? "weekly" : "monthly";
    let dueIso = s.next_due.slice(0, 10);
    // Догоняем все пропущенные списания до сегодня (кап — 24 периода).
    for (let guard = 0; dueIso <= todayIso && guard < 24; guard++) {
      const inserted = await sql`
        insert into transactions
          (org_id, source, external_id, kind, direction, gross_cents, fee_cents, net_cents,
           currency, occurred_at, description, category, category_method)
        values
          (${orgId}, 'manual', ${`msub-${s.id}-${dueIso}`}, 'adjustment', 'expense',
           ${Number(s.amount_cents)}, 0, ${-Number(s.amount_cents)},
           ${s.currency}, ${new Date(`${dueIso}T12:00:00Z`)}, ${s.name}, ${s.category}, 'user')
        on conflict (org_id, source, external_id) do nothing
        returning id
      `;
      created += inserted.length;
      dueIso = nextDueAfter(dueIso, cadence);
    }
    await sql`update manual_subscriptions set next_due = ${dueIso} where id = ${s.id}`;
  }
  return created;
}

/** Данные экрана аудита подписок: авто-детект (минус скрытые) + ручные + сводка. */
export async function getSubscriptions(orgId: string, asOf: Date = new Date()): Promise<SubscriptionsData | null> {
  const ctx = await getAccountContext(orgId);
  if (!ctx) return null;
  await materializeManualSubscriptions(orgId, asOf);
  const from = new Date(asOf.getTime() - 180 * DAY);
  const to = new Date(asOf.getTime() + DAY);
  const txns = await loadTransactions(orgId, { from, to });

  const [hidden, manual] = await Promise.all([
    loadHiddenBillKeys(orgId),
    loadManualRecurring(orgId, asOf), // суммы уже приведены к базовой валюте
  ]);

  // Авто-определённые: проставляем matchKey и убираем скрытые пользователем.
  const auto = filterHiddenRecurring(detectRecurring(txns, { asOf: asOf.getTime() }), hidden);

  const recurring = [...auto, ...manual].sort((a, b) => b.monthlyEstimateCents - a.monthlyEstimateCents);
  return { recurring, summary: subscriptionSummary(recurring), currency: ctx.baseCurrency, hidden: [...hidden] };
}

type ManualSubRow = { id: string; name: string; amount_cents: string; cadence: string; currency: string | null; next_due: Date | null; category: string | null };

/**
 * Маппинг строки manual_subscriptions в RecurringExpense (сумма → базовая валюта).
 * lastChargeAt = next_due МИНУС один период: computeUpcomingBills/nextDueDate
 * трактуют lastChargeAt как прошлое списание и проецируют +интервал вперёд,
 * поэтому так следующая дата совпадает с next_due (а не улетает на период вперёд).
 */
function manualRowToRecurring(asOf: Date, base: string, rates: Record<string, number>) {
  return (m: ManualSubRow): RecurringExpense => {
    // Подписка хранится в своей валюте → приводим к базовой валюте пространства.
    const amount = convertCents(Number(m.amount_cents), (m.currency || base).toUpperCase(), base, rates);
    const cadence = m.cadence === "weekly" ? "weekly" : "monthly";
    const intervalDays = cadence === "weekly" ? 7 : 30;
    const nextDue = m.next_due ? new Date(m.next_due) : new Date(asOf);
    const prevOccurrence = new Date(nextDue.getTime() - intervalDays * DAY);
    return {
      merchant: m.name,
      count: 0,
      avgAmountCents: amount,
      cadence,
      lastChargeAt: prevOccurrence.toISOString().slice(0, 10),
      monthlyEstimateCents: cadence === "weekly" ? Math.round(amount * 4.33) : amount,
      category: m.category,
      daysSinceLast: 0,
      stale: false,
      manualId: m.id,
      manual: true,
    };
  };
}

/**
 * Ручные подписки как RecurringExpense[] (суммы в базовой валюте) — чтобы они
 * показывались в «Ближайших счетах» обзора и в календаре наравне с авто-найденными
 * (иначе видны только на экране «Подписки» и как материализованные операции постфактум).
 */
export async function loadManualRecurring(orgId: string, asOf: Date = new Date()): Promise<RecurringExpense[]> {
  const [org] = await sql<{ base_currency: string | null }[]>`select base_currency from organizations where id = ${orgId}`;
  const base = (org?.base_currency ?? "EUR").toUpperCase();
  const rows = await sql<ManualSubRow[]>`
    select id, name, amount_cents, cadence, currency, next_due, category from manual_subscriptions where org_id = ${orgId}
  `;
  const rates = await getRates();
  return rows.map(manualRowToRecurring(asOf, base, rates));
}

export interface LiquidAccount {
  id: string;
  kind: "cash" | "bank" | "card" | "savings";
  name: string;
  balanceCents: number;
  currency: string;
}

/** Ликвидные счета (наличка/карта/банк/сбережения) — «Мои деньги». */
export async function getLiquidAccounts(orgId: string): Promise<LiquidAccount[]> {
  const rows = await sql<{ id: string; kind: string; name: string; balance_cents: string; currency: string }[]>`
    select id, kind, name, balance_cents, currency from accounts
    where org_id = ${orgId} and kind in ('cash','bank','card','savings')
    order by created_at asc
  `;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as LiquidAccount["kind"],
    name: r.name,
    balanceCents: Number(r.balance_cents),
    currency: r.currency,
  }));
}

/**
 * Синхронизирует «Остаток на счетах» (organizations.current_balance_cents) с
 * суммой ручных ликвидных счетов. Так введённые вручную наличка/карты питают
 * safe-to-spend и обзор. Возвращает новую сумму.
 */
export async function syncLiquidBalance(orgId: string): Promise<number> {
  const [org] = await sql<{ base_currency: string | null }[]>`select base_currency from organizations where id = ${orgId}`;
  const base = (org?.base_currency ?? "EUR").toUpperCase();
  const rows = await sql<{ balance_cents: string; currency: string }[]>`
    select balance_cents, currency from accounts
    where org_id = ${orgId} and kind in ('cash','bank','card','savings')
  `;
  const rates = await getRates();
  // Каждый счёт конвертируем из своей валюты в базовую — иначе смешаем валюты.
  const total = rows.reduce(
    (s, r) => s + convertCents(Number(r.balance_cents), (r.currency || base).toUpperCase(), base, rates),
    0
  );
  await sql`update organizations set current_balance_cents = ${total} where id = ${orgId}`;
  return total;
}

/** Сумма ликвидных счетов в базовой валюте (для «Всего на счетах»). */
export async function liquidTotalBaseCents(orgId: string, base: string): Promise<number> {
  const rows = await sql<{ balance_cents: string; currency: string }[]>`
    select balance_cents, currency from accounts
    where org_id = ${orgId} and kind in ('cash','bank','card','savings')
  `;
  const rates = await getRates();
  const b = (base || "EUR").toUpperCase();
  return rows.reduce((s, r) => s + convertCents(Number(r.balance_cents), (r.currency || b).toUpperCase(), b, rates), 0);
}

/** Чистый капитал: ручные счета/активы/долги + тренд по снимкам. */
export async function getNetWorth(orgId: string): Promise<{ nw: NetWorth; currency: string; trend: { day: string; netCents: number }[] } | null> {
  const ctx = await getAccountContext(orgId);
  if (!ctx) return null;
  const rows = await sql<{ id: string; kind: string; name: string; balance_cents: string; currency: string }[]>`
    select id, kind, name, balance_cents, currency from accounts
    where org_id = ${orgId} order by created_at asc
  `;
  const rates = await getRates();
  const base = ctx.baseCurrency.toUpperCase();
  const accounts: AccountBalance[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as AccountBalance["kind"],
    name: r.name,
    balanceCents: Number(r.balance_cents),                 // показ — в валюте счёта
    currency: r.currency,
    baseCents: convertCents(Number(r.balance_cents), (r.currency || base).toUpperCase(), base, rates), // итоги — в базе
  }));

  const snaps = await sql<{ day: string; net_cents: string }[]>`
    select day::text as day, net_cents from networth_snapshots
    where org_id = ${orgId} and day >= (current_date - interval '90 days')
    order by day asc
  `;
  const trend = snaps.map((s) => ({ day: s.day, netCents: Number(s.net_cents) }));

  return { nw: computeNetWorth(accounts), currency: ctx.baseCurrency, trend };
}

/** Пишет снимок net worth за сегодня для всех личных пространств со счетами (cron, раз в день). */
export async function writeNetWorthSnapshots(): Promise<number> {
  const orgs = await sql<{ org_id: string }[]>`
    select distinct a.org_id from accounts a
    join organizations o on o.id = a.org_id
    where o.type = 'personal'
  `;
  let n = 0;
  const rates = await getRates();
  for (const { org_id } of orgs) {
    const [org] = await sql<{ base_currency: string | null }[]>`select base_currency from organizations where id = ${org_id}`;
    const base = (org?.base_currency ?? "EUR").toUpperCase();
    const rows = await sql<{ kind: string; balance_cents: string; currency: string }[]>`
      select kind, balance_cents, currency from accounts where org_id = ${org_id}
    `;
    const nw = computeNetWorth(rows.map((r) => ({
      id: "", kind: r.kind as AccountBalance["kind"], name: "",
      balanceCents: Number(r.balance_cents), currency: r.currency,
      baseCents: convertCents(Number(r.balance_cents), (r.currency || base).toUpperCase(), base, rates),
    })));
    await sql`
      insert into networth_snapshots (org_id, day, assets_cents, debts_cents, net_cents)
      values (${org_id}, current_date, ${nw.assetsCents}, ${nw.debtsCents}, ${nw.netCents})
      on conflict (org_id, day) do update set
        assets_cents = ${nw.assetsCents}, debts_cents = ${nw.debtsCents}, net_cents = ${nw.netCents}
    `;
    n++;
  }
  return n;
}

/** Норма сбережений за месяц. */
export async function getMonthSavings(orgId: string, asOf: Date = new Date()): Promise<Savings> {
  const from = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const to = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1));
  const txns = await loadTransactions(orgId, { from, to });
  return computeSavings(txns);
}

/** Предложения лимитов бюджета: медиана трат по категории за последние 3 полных месяца. */
export async function getBudgetSuggestions(orgId: string, asOf: Date = new Date()): Promise<{ category: string; limitCents: number }[]> {
  const to = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const from = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 3, 1));
  const txns = await loadTransactions(orgId, { from, to });

  // category → { monthKey → cents }
  const byCat = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (t.direction !== "expense" || t.kind === "fee") continue;
    const cat = t.category ?? "Прочее";
    const mk = `${t.occurredAt.getUTCFullYear()}-${t.occurredAt.getUTCMonth()}`;
    const m = byCat.get(cat) ?? new Map<string, number>();
    m.set(mk, (m.get(mk) ?? 0) + t.grossCents);
    byCat.set(cat, m);
  }

  const median = (nums: number[]): number => {
    if (nums.length === 0) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
  };

  const out: { category: string; limitCents: number }[] = [];
  for (const [cat, months] of byCat) {
    const limitCents = Math.round(median([...months.values()]) / 1000) * 1000; // округляем до €10
    if (limitCents > 0) out.push({ category: cat, limitCents });
  }
  return out.sort((a, b) => b.limitCents - a.limitCents).slice(0, 8);
}

/** Статус бюджетов-конвертов за месяц ('YYYY-MM'). */
export async function getBudgetStatus(orgId: string, month: string): Promise<BudgetLine[]> {
  const rows = await sql<{ category: string; amount_cents: string }[]>`
    select category, amount_cents from budgets where org_id = ${orgId} and month = ${month}
    order by amount_cents desc
  `;
  const limits = rows.map((r) => ({ category: r.category, limitCents: Number(r.amount_cents) }));
  if (limits.length === 0) return [];

  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y!, m! - 1, 1));
  const to = new Date(Date.UTC(y!, m!, 1));
  const txns = await loadTransactions(orgId, { from, to });

  const now = new Date();
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const isCurrentMonth = now.getUTCFullYear() === y && now.getUTCMonth() === m! - 1;
  const dayOfMonth = isCurrentMonth ? now.getUTCDate() : daysInMonth;

  // Плановые траты из календаря и ручные регулярные платежи (зарплаты, аренда)
  // на ОСТАТОК месяца резервируют деньги конверта (прошлое уже в транзакциях).
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const plannedFrom = todayStart > from ? todayStart : from;
  const plannedByCategory = new Map<string, number>();
  if (plannedFrom < to) {
    const occ = expandPlanned(await loadPlannedItems(orgId), plannedFrom, to);
    for (const o of occ) {
      if (o.direction !== "expense" || !o.category) continue;
      plannedByCategory.set(o.category, (plannedByCategory.get(o.category) ?? 0) + o.amountCents);
    }
    const subRows = await sql<{ amount_cents: string; cadence: string; next_due: string | null; category: string | null }[]>`
      select amount_cents, cadence, next_due::text as next_due, category
      from manual_subscriptions where org_id = ${orgId} and category is not null
    `;
    const manual = manualSubsByCategory(
      subRows.map((r) => ({
        amountCents: Number(r.amount_cents),
        cadence: r.cadence === "weekly" ? "weekly" : "monthly",
        nextDue: r.next_due,
        category: r.category,
      })),
      plannedFrom, to
    );
    for (const [cat, cents] of manual) {
      plannedByCategory.set(cat, (plannedByCategory.get(cat) ?? 0) + cents);
    }
  }

  return computeBudgetStatus(limits, txns, { dayOfMonth, daysInMonth, plannedByCategory });
}
