import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { getAccountContext } from "@/lib/account/context";
import { loadPlannedItems } from "@/lib/planned/load";
import { expandPlanned } from "@/lib/metrics/planned";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { CashflowCalendar } from "@/components/CashflowCalendar";
import { EventFeed } from "@/components/EventFeed";
import { loadTransactions } from "@/lib/transactions";
import { buildMonthCalendar, buildEventFeed, nextDueDate } from "@/lib/metrics/calendar";
import { detectRecurring } from "@/lib/metrics/recurring";
import { computeUpcomingBills } from "@/lib/metrics/bills";
import { loadHiddenBillKeys, filterHiddenRecurring, loadManualRecurring } from "@/lib/personal/data";
import { getCategoriesFor } from "@/lib/categorize/custom";
import { HideBillButton } from "@/components/HideBillButton";
import { RemoveManualSubButton } from "@/components/RemoveManualSubButton";
import { forecastCashFlow } from "@/lib/metrics/forecast";
import { estimateTaxReserve } from "@/lib/metrics/tax";
import { getOrgPlan, getPersonalPlan } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { canP } from "@/lib/billing/entitlements.personal";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag } from "@/lib/i18n";

const DAY = 86_400_000;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const [org] = await sql<
    { id: string; name: string; current_balance_cents: string | null; safe_threshold_cents: string | null; tax_rate_pct: string | null; base_currency: string | null }[]
  >`
    select id, name, current_balance_cents, safe_threshold_cents, tax_rate_pct, base_currency
    from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const personal = (await getAccountContext(org.id))?.type === "personal";
  const { plan } = await getOrgPlan(org.id);
  const cur = org.base_currency ?? "EUR";
  const locale = await getLocale();
  const tr = translator(locale);
  // Личные пространства гейтятся личной сеткой (plus), бизнес — бизнесовой.
  const smart = personal
    ? canP(await getPersonalPlan(org.id), "cashAlerts")
    : can(plan, "cashGapAlerts");

  const params = await searchParams;
  const now = new Date();
  const monthParam = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : null;
  const from = monthParam
    ? new Date(Date.UTC(+monthParam.slice(0, 4), +monthParam.slice(5, 7) - 1, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const prevYm = ym(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1)));
  const nextYm = ym(to);
  const monthLabel = from.toLocaleDateString(localeTag(locale), { month: "long", year: "numeric" });

  const monthTxns = await loadTransactions(org.id, { from, to });

  let recurring = undefined;
  let gapDate: string | null = null;
  let feedEvents = [] as ReturnType<typeof buildEventFeed>;
  if (smart) {
    const recentTxns = await loadTransactions(org.id, { from: new Date(now.getTime() - 120 * DAY), to: new Date(now.getTime() + DAY) });
    // Скрытые пользователем авто-платежи не показываем и не прогнозируем.
    // Авто-найденные (минус скрытые) + ручные подписки — чтобы указанные вручную
    // тоже были в календаре (сетка + блок «Регулярные платежи»).
    const auto = filterHiddenRecurring(detectRecurring(recentTxns), await loadHiddenBillKeys(org.id));
    recurring = [...auto, ...(await loadManualRecurring(org.id, now))];

    let forecast = null;
    if (org.current_balance_cents !== null) {
      forecast = forecastCashFlow(recentTxns, Number(org.current_balance_cents), {
        horizonDays: 30,
        thresholdCents: org.safe_threshold_cents === null ? 0 : Number(org.safe_threshold_cents),
      });
      gapDate = forecast.gapDate;
    }

    const incomeCents = monthTxns.filter((t) => t.direction === "income").reduce((s, t) => s + t.grossCents, 0);
    const hasExpense = monthTxns.some((t) => t.direction === "expense");
    const ratePct = org.tax_rate_pct !== null ? Number(org.tax_rate_pct) : 0;

    feedEvents = buildEventFeed({
      forecast,
      recurring,
      coverageIncomeOnly: incomeCents > 0 && !hasExpense,
      taxReserveCents: ratePct > 0 ? estimateTaxReserve(incomeCents, ratePct) : null,
      fmt: (c) => formatMoney(c, cur),
      today: now,
      t: tr,
      tag: localeTag(locale),
    });
  }

  const cal = buildMonthCalendar(monthTxns, {
    year: from.getUTCFullYear(),
    month: from.getUTCMonth(),
    today: now,
    recurring,
    gapDate,
  });

  // Плановые операции: развернуть на видимый месяц и разложить по дням.
  const plannedItems = await loadPlannedItems(org.id);
  const plannedOcc = expandPlanned(plannedItems, from, to);
  const plannedByDay: Record<number, typeof plannedOcc> = {};
  for (const o of plannedOcc) {
    const day = new Date(`${o.day}T00:00:00Z`).getUTCDate();
    (plannedByDay[day] ??= []).push(o);
  }

  // Предстоящие списания подписок по дням — теми же правилами, что рисует сетка
  // (buildMonthCalendar): только текущий месяц и день >= сегодня. Чтобы клик по дню
  // с чипом подписки показывал её в деталях (а не «операций нет») и давал убрать.
  type DayBill = { label: string; amountCents: number; matchKey?: string; manualId?: string };
  const billsByDay: Record<number, DayBill[]> = {};
  const isCurrentMonth = now.getUTCFullYear() === from.getUTCFullYear() && now.getUTCMonth() === from.getUTCMonth();
  if (recurring && isCurrentMonth) {
    const todayDay = now.getUTCDate();
    for (const r of recurring) {
      const due = nextDueDate(r.lastChargeAt, r.cadence, now);
      if (due.getUTCFullYear() === from.getUTCFullYear() && due.getUTCMonth() === from.getUTCMonth()) {
        const d = due.getUTCDate();
        if (d >= todayDay) (billsByDay[d] ??= []).push({ label: r.merchant, amountCents: r.avgAmountCents, matchKey: r.matchKey, manualId: r.manualId });
      }
    }
  }

  const dayTxns: Record<number, { description: string | null; amountCents: number; dir: "in" | "out"; category: string | null }[]> = {};
  for (const t of monthTxns) {
    const d = new Date(t.occurredAt);
    if (d.getUTCFullYear() === from.getUTCFullYear() && d.getUTCMonth() === from.getUTCMonth()) {
      const day = d.getUTCDate();
      (dayTxns[day] ??= []).push({
        description: t.description,
        amountCents: t.grossCents,
        dir: t.direction === "income" ? "in" : "out",
        category: t.category,
      });
    }
  }

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="calendar" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{personal ? tr("pcal.title") : tr("calp.title")}</h1>
            <div className="sub">{personal ? tr("pcal.sub", { month: monthLabel }) : tr("calp.sub", { month: monthLabel })}</div>
          </div>
          <div className="actions">
            <a className="btn btn-line btn-sm" href={`/app/calendar?month=${prevYm}`}>{tr("calp.prev")}</a>
            <a className="btn btn-line btn-sm" href={`/app/calendar?month=${nextYm}`}>{tr("calp.next")}</a>
            <SignOutButton locale={locale} />
          </div>
        </div>

        <div className="grid-2">
          <CashflowCalendar cal={cal} currency={cur} dayTxns={dayTxns} plannedByDay={plannedByDay} billsByDay={billsByDay} locale={locale} categories={await getCategoriesFor(org.id)} />
          <EventFeed events={feedEvents} locked={!smart} locale={locale} />
        </div>

        {smart && recurring && recurring.length > 0 && (
          <div className="panel" style={{ marginTop: 18 }}>
            <div className="panel-head">
              <h3>{tr("pcal.autoBills")}</h3>
              <Link href="/app/subscriptions" className="cat-action" style={{ textDecoration: "none" }}>{tr("pcal.addSub")}</Link>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: -12, marginBottom: 12 }}>{tr("pcal.autoBillsNote")}</div>
            <div className="sub-list">
              {computeUpcomingBills(recurring, { horizonDays: 30, asOf: now }).map((b, i) => (
                <div className="sub-row" key={`${b.label}-${i}`}>
                  <div className="sub-main">
                    <div className="sub-name">{b.label}</div>
                    <div className="sub-meta">{b.dueDate.toLocaleDateString(localeTag(locale), { day: "numeric", month: "short" })}</div>
                  </div>
                  <div className="sub-amt amt neg">−{formatMoney(b.amountCents, cur)}</div>
                  {b.manualId
                    ? <RemoveManualSubButton manualId={b.manualId} locale={locale} />
                    : b.matchKey && <HideBillButton matchKey={b.matchKey} locale={locale} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
