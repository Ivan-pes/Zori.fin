import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { DashboardChat } from "@/components/DashboardChat";
import { SignOutButton } from "@/components/SignOutButton";
import { SyncButton } from "@/components/SyncButton";
import { ForecastPanel } from "@/components/ForecastPanel";
import { MonthCashflowChart } from "@/components/MonthCashflowChart";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { PersonalOverview } from "@/components/PersonalOverview";
import { SignalFeed } from "@/components/SignalFeed";
import { KpiQuickAdd } from "@/components/KpiQuickAdd";
import { getCategoriesFor } from "@/lib/categorize/custom";
import { getCategorySignals } from "@/lib/metrics/categorySignalsData";
import { ProfitWaterfall } from "@/components/ProfitWaterfall";
import { UnitEconomicsPanel } from "@/components/UnitEconomicsPanel";
import { getUnitEconomics } from "@/lib/metrics/unitEconomicsData";
import { getSubscriptions } from "@/lib/personal/data";
import { computeUpcomingBills } from "@/lib/metrics/bills";
import { getAccountContext } from "@/lib/account/context";
import { loadTransactions } from "@/lib/transactions";
import { computePnL, expenseBreakdown } from "@/lib/metrics/engine";
import { getOrgPlan } from "@/lib/billing/plan";
import { earliestAllowed } from "@/lib/billing/history";
import { getCoverage, summarizeCoverage, monthLabel } from "@/lib/metrics/coverage";
import { computeRunway } from "@/lib/metrics/runway";
import { estimateTaxReserve } from "@/lib/metrics/tax";
import { formatMoney, formatPct } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag } from "@/lib/i18n";
import { categoryLabel } from "@/lib/i18n/categories";

function momDelta(currentCents: number, prevCents: number): { pct: number; up: boolean } | null {
  if (prevCents < 5000) return null;
  const pct = ((currentCents - prevCents) / Math.abs(prevCents)) * 100;
  if (!Number.isFinite(pct)) return null;
  return { pct: Math.round(pct), up: pct >= 0 };
}

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; onboarding?: string; month?: string; flow?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const locale = await getLocale();
  const tr = translator(locale);
  const tag = localeTag(locale);
  const monthYear = (d: Date) => d.toLocaleDateString(tag, { month: "long", year: "numeric" });

  const params = await searchParams;
  const justConnected = params.connected === "stripe";
  const justConnectedBank = params.connected === "bank";
  const previewOnboarding = params.onboarding === "preview";

  const [org] = await sql<{ id: string; name: string; current_balance_cents: string | null; tax_rate_pct: string | null }[]>`
    select id, name, current_balance_cents, tax_rate_pct from organizations
    where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  // Zori Personal: личное пространство рендерит собственный обзор.
  const accountCtx = await getAccountContext(org.id);
  if (accountCtx?.type === "personal") {
    const pMonth = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : null;
    return (
      <div className="app">
        <Sidebar orgId={org.id} orgName={org.name} active="overview" />
        <main className="main">
          <PersonalOverview orgId={org.id} orgName={org.name} locale={locale} monthParam={pMonth} />
        </main>
      </div>
    );
  }

  const { plan } = await getOrgPlan(org.id);

  const now = new Date();
  const monthParam = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : null;
  const from = monthParam
    ? new Date(Date.UTC(+monthParam.slice(0, 4), +monthParam.slice(5, 7) - 1, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const prevYm = ym(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1)));
  const nextYm = ym(to);
  const isCurrentMonth = from.getUTCFullYear() === now.getUTCFullYear() && from.getUTCMonth() === now.getUTCMonth();
  const floor = earliestAllowed(plan);
  const prevDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1));
  const prevAllowed = !floor || prevDate >= floor;

  const monthTxns = await loadTransactions(org.id, { from, to });
  const pnl = computePnL(monthTxns);
  const breakdown = expenseBreakdown(monthTxns);
  const recent = [...monthTxns].slice(-6).reverse();

  const flowMode: "month" | "range" = params.flow === "1m" ? "month" : "range";
  let chartFrom = flowMode === "range"
    ? new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 2, 1))
    : from;
  if (floor && chartFrom < floor) chartFrom = floor;
  const chartTo = to;
  const chartTxns = flowMode === "range"
    ? await loadTransactions(org.id, { from: chartFrom, to: chartTo })
    : monthTxns;
  const flowBase = monthParam ? `/app?month=${monthParam}&` : "/app?";
  const flowToggle = (
    <span className="mc-range">
      <a className={flowMode === "range" ? "on" : ""} href={`${flowBase}flow=3m`}>{tr("ov.flow3m")}</a>
      <a className={flowMode === "month" ? "on" : ""} href={`${flowBase}flow=1m`}>{tr("ov.flowMonth")}</a>
    </span>
  );

  const prevFrom = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1));
  const prevPnl = computePnL(await loadTransactions(org.id, { from: prevFrom, to: from }));
  const prevMonthLabel = prevFrom.toLocaleDateString(tag, { month: "long" });
  const revDelta = momDelta(pnl.revenueCents, prevPnl.revenueCents);
  const expDelta = momDelta(pnl.totalExpenseCents, prevPnl.totalExpenseCents);
  const profitDelta = momDelta(pnl.profitCents, prevPnl.profitCents);

  const [intg] = await sql<{ n: number }[]>`
    select count(*)::int as n from integrations where org_id = ${org.id} and status = 'active'
  `;
  const connected = (intg?.n ?? 0) > 0;
  const [txAny] = await sql<{ n: number }[]>`
    select count(*)::int as n from transactions where org_id = ${org.id}
  `;
  const hasTransactions = (txAny?.n ?? 0) > 0;
  const balanceSet = org.current_balance_cents !== null;

  const coverage = summarizeCoverage(await getCoverage(org.id, plan));

  const showInsights = plan !== "free";
  const balanceCents = org.current_balance_cents != null ? Number(org.current_balance_cents) : null;
  const last30 = showInsights
    ? await loadTransactions(org.id, { from: new Date(now.getTime() - 30 * 86_400_000), to: new Date(now.getTime() + 86_400_000) })
    : [];
  const avgDailyNet = last30.length ? last30.reduce((s, t) => s + t.netCents, 0) / 30 : 0;
  const runway = balanceCents != null ? computeRunway(balanceCents, avgDailyNet, now) : null;
  const taxRate = org.tax_rate_pct != null ? Number(org.tax_rate_pct) : 0;
  const taxReserve = estimateTaxReserve(pnl.netRevenueCents, taxRate);

  const cur = pnl.currency;
  const breakdownTotal = breakdown.reduce((s, e) => s + e.totalCents, 0);

  // Сигнальная лента по категориям — топ проблемных статей (§6).
  const { signals: catSignals } = await getCategorySignals(org.id, new Date(), locale);
  const watchCats = catSignals.filter((s) => s.status !== "healthy");

  // Юнит-экономика (есть только при синхронизированных подписках Stripe).
  const unitEcon = await getUnitEconomics(org.id).catch(() => null);

  // Без Stripe-подписок вторую колонку занимает панель обязательных платежей.
  const subsData = unitEcon ? null : await getSubscriptions(org.id).catch(() => null);
  const upcomingBills = subsData ? computeUpcomingBills(subsData.recurring, { horizonDays: 30, asOf: now }) : [];
  const upcomingTotal = upcomingBills.reduce((s, b) => s + b.amountCents, 0);

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="overview" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nav.overview")}</h1>
            <div className="sub" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>{org.name}</span>
              <span>·</span>
              {prevAllowed ? (
                <a href={`/app?month=${prevYm}`} className="month-nav" aria-label={tr("ov.prevMonth")}>←</a>
              ) : (
                <a href="/app/settings" className="month-nav" style={{ opacity: 0.4 }} title={tr("ov.historyLock")} aria-label={tr("ov.historyLock")}>🔒</a>
              )}
              <span style={{ minWidth: 92, textAlign: "center", fontWeight: 600, color: "var(--ink)" }}>{monthYear(from)}</span>
              {isCurrentMonth ? (
                <span className="month-nav" style={{ opacity: 0.3, cursor: "default" }}>→</span>
              ) : (
                <a href={`/app?month=${nextYm}`} className="month-nav" aria-label={tr("ov.nextMonth")}>→</a>
              )}
            </div>
          </div>
          <div className="actions">
            {connected ? (
              <>
                <span className="pill"><span className="g" />{tr("ov.stripeConnected")}</span>
                <SyncButton />
              </>
            ) : (
              <a className="btn btn-dark" href="/api/stripe/connect">{tr("ov.connectStripe")}</a>
            )}
            <SignOutButton locale={locale} />
          </div>
        </div>

        {justConnected && (
          <div style={{ background: "var(--accent-soft)", color: "var(--accent-ink)", border: "1px solid #CDE5DC", borderRadius: 12, padding: "12px 16px", marginBottom: 18, fontSize: 14 }}>
            {tr("ov.bannerStripe")}
          </div>
        )}
        {justConnectedBank && (
          <div style={{ background: "var(--accent-soft)", color: "var(--accent-ink)", border: "1px solid #CDE5DC", borderRadius: 12, padding: "12px 16px", marginBottom: 18, fontSize: 14 }}>
            {tr("ov.bannerBank")}
          </div>
        )}

        {coverage.incomeOnly.length > 0 && (
          <div className="note warn" style={{ marginBottom: 18 }}>
            <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
            <span>
              {tr("ov.coverageWarnA", { months: coverage.incomeOnly.map((mm) => monthLabel(mm, tag)).join(", ") })} <strong>{tr("ov.coverageWarnBold")}</strong>.{" "}
              <a href="/app/integrations" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{tr("ov.loadStatement")}</a>.
            </span>
          </div>
        )}

        <OnboardingChecklist connected={connected} hasTransactions={hasTransactions} balanceSet={balanceSet} preview={previewOnboarding} locale={locale} />

        <div className="kpi-row">
          <KpiQuickAdd
            kind="income"
            label={tr("ov.kpiRevenue")}
            valueCents={pnl.revenueCents}
            currency={cur}
            locale={locale}
            deltaNode={revDelta ? <div className={`k-delta ${revDelta.up ? "up" : "down"}`}>{revDelta.up ? "▲" : "▼"} {Math.abs(revDelta.pct)}% {tr("ov.vs", { month: prevMonthLabel })}</div> : null}
          />
          <div className="kpi">
            <div className="k-top"><span className="k-lbl">{tr("ov.kpiProfit")}</span><span className="k-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg></span></div>
            <div className="k-val" style={{ color: pnl.profitCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>{formatMoney(pnl.profitCents, cur)}</div>
            <div className={`k-delta ${pnl.profitCents >= 0 ? "up" : "down"}`}>{tr("ov.margin", { pct: formatPct(pnl.marginPct) })}</div>
          </div>
          <KpiQuickAdd
            kind="expense"
            label={tr("ov.kpiExpenses")}
            valueCents={pnl.totalExpenseCents}
            currency={cur}
            locale={locale}
            categories={await getCategoriesFor(org.id)}
            deltaNode={expDelta ? <div className={`k-delta ${expDelta.up ? "down" : "up"}`}>{expDelta.up ? "▲" : "▼"} {Math.abs(expDelta.pct)}% {tr("ov.vs", { month: prevMonthLabel })}</div> : null}
          />
          <div className="kpi">
            <div className="k-top"><span className="k-lbl">{tr("ov.kpiOps")}</span><span className="k-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg></span></div>
            <div className="k-val">{monthTxns.length}</div>
            <div className="k-delta">{pnl.feeCents > 0 ? tr("ov.fees", { money: formatMoney(pnl.feeCents, cur) }) : tr("ov.perMonth")}</div>
          </div>
        </div>

        {showInsights && (
          <div className="grid-2eq">
            <div className="kpi">
              <div className="k-top"><span className="k-lbl">{tr("ov.runwayTitle")}</span><span className="k-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m7 14 3-3 3 3 5-5" /></svg></span></div>
              {balanceCents == null ? (
                <>
                  <div className="k-val">—</div>
                  <div className="k-delta">{tr("ov.setBalance")}</div>
                </>
              ) : runway!.profitable ? (
                <>
                  <div className="k-val" style={{ color: "var(--accent-ink)" }}>∞</div>
                  <div className="k-delta up">{tr("ov.flowPositive", { money: formatMoney(runway!.monthlyNetCents, cur) })}</div>
                </>
              ) : (
                <>
                  <div className="k-val" style={{ color: runway!.runwayMonths! < 3 ? "var(--danger)" : "var(--ink)" }}>{tr("ov.monthsShort", { n: runway!.runwayMonths! })}</div>
                  <div className="k-delta down">{tr("ov.burning", { money: formatMoney(runway!.burnRateCents, cur), date: new Date(runway!.runoutDate!).toLocaleDateString(tag, { day: "numeric", month: "short" }) })}</div>
                </>
              )}
            </div>
            <div className="kpi">
              <div className="k-top"><span className="k-lbl">{tr("ov.taxTitle")}</span><span className="k-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9h18M9 21V9M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /></svg></span></div>
              {taxRate > 0 ? (
                <>
                  <div className="k-val">{formatMoney(taxReserve, cur)}</div>
                  <div className="k-delta">{tr("ov.taxOfRevenue", { pct: formatPct(taxRate), month: monthYear(from) })}</div>
                </>
              ) : (
                <>
                  <div className="k-val">—</div>
                  <div className="k-delta">{tr("ov.setRateIn")} <a href="/app/settings" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{tr("nav.settings")}</a></div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="grid-2">
          <MonthCashflowChart txns={chartTxns} from={chartFrom} to={chartTo} currency={cur} mode={flowMode} toggle={flowToggle} locale={locale} />

          <div className="panel assist">
            <div className="panel-head">
              <h3>{tr("nav.assistant")}</h3>
              <span style={{ fontSize: 12, color: "var(--ink-faint)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />{tr("ov.online")}
              </span>
            </div>
            <DashboardChat locale={locale} currency={cur} />
          </div>
        </div>

        <div className="grid-2">
          <div className="panel">
            <div className="panel-head">
              <h3>{tr("ov.opsMonth")}</h3>
              <a href="/app/transactions" style={{ fontSize: 12.5, color: "var(--accent-ink)", fontWeight: 600, textDecoration: "none" }}>{tr("ov.allTx")}</a>
            </div>
            {recent.length === 0 ? (
              <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>
                {tr("ov.noOpsMonth")} {!connected && (<><a href="/api/stripe/connect" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{tr("ov.connectStripe")}</a>{tr("ov.orLoadToSee")}</>)}
              </p>
            ) : (
              <table className="tx-table">
                <thead><tr><th>{tr("ov.thDesc")}</th><th>{tr("ov.thCat")}</th><th style={{ textAlign: "right" }}>{tr("ov.thAmount")}</th></tr></thead>
                <tbody>
                  {recent.map((t) => {
                    const income = t.direction === "income";
                    return (
                      <tr key={t.id}>
                        <td><span className="tx-ic">{income ? "↑" : "↓"}</span><span className="tx-name">{t.description ?? tr("ov.noDesc")}</span></td>
                        <td>{income
                          ? <span className="cat-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{tr("ov.revenueTag")}</span>
                          : <span className="cat-tag">{t.category ?? tr("ov.other")}</span>}</td>
                        <td className={`amt ${income ? "pos" : "neg"}`}>{t.origCurrency ? <span className="fx-orig" title={tr("tx.original", { amount: formatMoney(t.origGrossCents ?? 0, t.origCurrency) })}>≈ </span> : null}{income ? "+" : "−"}{formatMoney(t.grossCents, t.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>{tr("ov.whereMoney")}</h3><span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{monthYear(from)}</span></div>
            {breakdown.length === 0 ? (
              <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("ov.noExpensesPeriod")}</p>
            ) : (
              <div className="brk">
                {breakdown.map((e) => {
                  const pct = breakdownTotal > 0 ? Math.round((e.totalCents / breakdownTotal) * 100) : 0;
                  const isFee = e.label.toLowerCase().includes("комисс");
                  return (
                    <div className="brk-item" key={e.label}>
                      <div className="bl"><b>{categoryLabel(e.label, locale)}</b><span>{formatMoney(e.totalCents, cur)} · {pct}%</span></div>
                      <div className="bar"><i style={{ width: `${pct}%`, background: isFee ? "var(--warn)" : "var(--accent)" }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {watchCats.length > 0 && (
          <div className="panel" style={{ marginTop: 6 }}>
            <div className="panel-head">
              <h3>{tr("nav.categories")}</h3>
              <a href="/app/categories" style={{ fontSize: 12.5, color: "var(--accent-ink)", fontWeight: 600, textDecoration: "none" }}>{tr("ov.allTx")}</a>
            </div>
            <SignalFeed signals={watchCats} limit={3} locale={locale} />
          </div>
        )}

        <div className="grid-2" style={{ marginTop: 6 }}>
          <div className="panel">
            <div className="panel-head"><h3>{tr("wf.title")}</h3><span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{monthYear(from)}</span></div>
            <ProfitWaterfall pnl={pnl} locale={locale} />
          </div>
          {unitEcon ? (
            <div className="panel">
              <div className="panel-head"><h3>{tr("ue.title")}</h3></div>
              <UnitEconomicsPanel econ={unitEcon.econ} currency={unitEcon.currency} locale={locale} />
            </div>
          ) : (
            <div className="panel">
              <div className="panel-head">
                <h3>{tr("bs.upcoming")}</h3>
                <a href="/app/subscriptions" style={{ fontSize: 12.5, color: "var(--accent-ink)", fontWeight: 600, textDecoration: "none" }}>{tr("bs.manage")}</a>
              </div>
              {upcomingBills.length === 0 ? (
                <p style={{ color: "var(--ink-faint)", fontSize: 13.5 }}>{tr("bs.upEmpty")}</p>
              ) : (
                <>
                  <table className="tx-table tx-full">
                    <tbody>
                      {upcomingBills.slice(0, 5).map((b, i) => (
                        <tr key={`${b.label}-${i}`}>
                          <td>
                            <span className="tx-name">{b.label}</span>
                            {b.category && <span className="cat-tag" style={{ marginLeft: 8 }}>{b.category}</span>}
                          </td>
                          <td style={{ color: "var(--ink-faint)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                            {b.dueDate.toLocaleDateString(localeTag(locale), { day: "numeric", month: "short" })}
                          </td>
                          <td className="amt neg">−{formatMoney(b.amountCents, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10, fontSize: 13.5 }}>
                    <span style={{ color: "var(--ink-soft)" }}>{tr("bs.upTotal")}</span>
                    <b>−{formatMoney(upcomingTotal, cur)}</b>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div id="cash-forecast" style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: "0 2px 8px" }}>
            {tr("ov.forecastNote")}
          </div>
          <ForecastPanel locale={locale} currency={cur} />
        </div>
      </main>
    </div>
  );
}
