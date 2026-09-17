import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { PrintButton } from "@/components/PrintButton";
import { UpgradeGate } from "@/components/UpgradeGate";
import { ReportSummary } from "@/components/ReportSummary";
import { RecurringExpenses } from "@/components/RecurringExpenses";
import { BenchmarksPanel } from "@/components/BenchmarksPanel";
import { MrrWaterfall } from "@/components/MrrWaterfall";
import { AnomaliesPanel } from "@/components/AnomaliesPanel";
import { ConcentrationPanel } from "@/components/ConcentrationPanel";
import { BudgetVsActual } from "@/components/BudgetVsActual";
import { SendReportButton } from "@/components/SendReportButton";
import { getOrgPlan, isGrowthPlus } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { computeReportData, deltaLabel, formatGapDate, MAX_WEEKS_BACK } from "@/lib/reports/weekly";
import { loadTransactions } from "@/lib/transactions";
import { computePnL, expensesByCategory } from "@/lib/metrics/engine";
import { computeSaaSMetrics, loadSubscriptionMetrics, reportInsights } from "@/lib/metrics/subscriptions";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag, type Locale } from "@/lib/i18n";
import { getAccountContext } from "@/lib/account/context";
import { PersonalDigest } from "@/components/PersonalDigest";
import type { NormalizedTransaction } from "@/types";

const SHADES = ["#C9C4B6", "#8FCBB0", "#6BB89E", "#3E9C7C", "#2E8E6C", "#1F7A5C"];

function insightIcon(tone: "ok" | "warn" | "info") {
  if (tone === "ok") return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>;
  if (tone === "warn") return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
}

function sparkline(series: number[], color = "#1F7A5C") {
  const w = 120, h = 34;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const pts = series
    .map((v, i) => `${(i / Math.max(series.length - 1, 1)) * w},${h - 2 - ((v - min) / range) * (h - 4)}`)
    .join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function weeklyBuckets(txns: NormalizedTransaction[], weeks: number, tag: string) {
  const now = Date.now();
  const buckets: NormalizedTransaction[][] = Array.from({ length: weeks }, () => []);
  const labels: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    labels.push(new Date(now - i * 7 * 86_400_000).toLocaleDateString(tag, { day: "numeric", month: "short" }));
  }
  for (const t of txns) {
    const wk = Math.floor((now - t.occurredAt.getTime()) / (7 * 86_400_000));
    const idx = weeks - 1 - wk;
    if (idx >= 0 && idx < weeks) buckets[idx]!.push(t);
  }
  return buckets.map((items, i) => {
    const p = computePnL(items);
    return { label: labels[i]!, revenueCents: p.netRevenueCents, clients: items.filter((t) => t.kind === "charge").length };
  });
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ week?: string; period?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const [org] = await sql<
    { id: string; name: string; current_balance_cents: string | null; safe_threshold_cents: string | null; industry: string | null }[]
  >`
    select id, name, current_balance_cents, safe_threshold_cents, industry from organizations
    where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const locale: Locale = await getLocale();
  const tr = translator(locale);
  const tag = localeTag(locale);

  // Личное пространство: вместо бизнес-отчётов — личный дайджест.
  const accountCtx = await getAccountContext(org.id);
  if (accountCtx?.type === "personal") {
    const now = new Date();
    const monthLabel = now.toLocaleDateString(tag, { month: "long", year: "numeric" });
    return (
      <div className="app">
        <Sidebar orgId={org.id} orgName={org.name} active="reports" />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>{tr("dig.title")}</h1>
              <div className="sub">{tr("dig.sub", { month: monthLabel })}</div>
            </div>
            <div className="actions"><SignOutButton locale={locale} /></div>
          </div>
          <PersonalDigest orgId={org.id} locale={locale} />
        </main>
      </div>
    );
  }

  const { plan } = await getOrgPlan(org.id);
  if (!can(plan, "weeklyReports")) {
    return (
      <div className="app">
        <Sidebar orgId={org.id} orgName={org.name} active="reports" />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>{tr("nav.reports")}</h1>
              <div className="sub">{tr("rep.weeklySub")} · {org.name}</div>
            </div>
            <div className="actions"><SignOutButton locale={locale} /></div>
          </div>
          <UpgradeGate title={tr("rep.gateTitle")} feature={tr("rep.gateFeature")} locale={locale} />
        </main>
      </div>
    );
  }

  const sp = await searchParams;
  const weekRaw = parseInt(sp.week ?? "0", 10);
  const week = Number.isFinite(weekRaw) ? Math.min(Math.max(weekRaw, 0), MAX_WEEKS_BACK) : 0;
  const period: "week" | "month" | "3m" = sp.period === "month" ? "month" : sp.period === "3m" ? "3m" : "week";

  const data = await computeReportData(org, week);
  const cur = data.pnl.currency;
  const relLabel = week === 0 ? tr("rep.relCurrent") : week === 1 ? tr("rep.relPrev") : tr("rep.relAgo", { n: week });

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(now.getTime() + 86_400_000);
  const monthTxns = await loadTransactions(org.id, { from: monthStart, to });
  const prevMonthTxns = await loadTransactions(org.id, { from: prevMonthStart, to: monthStart });
  const weeksTxns = await loadTransactions(org.id, { from: new Date(now.getTime() - 42 * 86_400_000), to });

  const periodMonths = period === "3m" ? 3 : 1;
  const periodFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (periodMonths - 1), 1));
  const periodTxns = period === "week" ? [] : await loadTransactions(org.id, { from: periodFrom, to });
  const periodPnl = computePnL(periodTxns);
  const periodTop = expensesByCategory(periodTxns).slice(0, 5);
  const shortMonth = (d: Date) => d.toLocaleDateString(tag, { month: "short" });
  const periodLabel =
    period === "3m"
      ? `${shortMonth(periodFrom)} – ${now.toLocaleDateString(tag, { month: "short", year: "numeric" })}`
      : now.toLocaleDateString(tag, { month: "long", year: "numeric" });
  const periodTitle = period === "week" ? tr("rep.titleWeek") : period === "month" ? tr("rep.titleMonth") : tr("rep.title3m");
  const periodSub = period === "week" ? tr("rep.weeklySub") : period === "month" ? tr("rep.monthlySub") : tr("rep.quarterSub");

  const realMetrics = await loadSubscriptionMetrics(org.id);
  const saas = realMetrics ?? computeSaaSMetrics(monthTxns, prevMonthTxns);
  const realSubs = saas.source === "subscriptions";
  const monthPnl = computePnL(monthTxns);
  const insights = reportInsights({
    marginPct: monthPnl.marginPct,
    profitCents: monthPnl.profitCents,
    activeClients: saas.activeClients,
    hasExpensesBeyondFees: expensesByCategory(monthTxns).length > 0,
    t: tr,
  });
  const weeks = weeklyBuckets(weeksTxns, 6, tag);
  const maxWeekRev = Math.max(...weeks.map((w) => w.revenueCents), 1);
  const mrrSeries = weeks.map((w) => w.revenueCents);
  const clientsSeries = weeks.map((w) => w.clients);
  const arpuSeries = weeks.map((w) => (w.clients > 0 ? Math.round(w.revenueCents / w.clients) : 0));

  const curMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const targetMap: Record<"revenue" | "expense" | "profit", number | null> = { revenue: null, expense: null, profit: null };
  if (isGrowthPlus(plan)) {
    const targetRows = await sql<{ metric: string; amount_cents: string }[]>`
      select metric, amount_cents from targets where org_id = ${org.id} and month = ${curMonth}
    `;
    for (const r of targetRows) {
      if (r.metric === "revenue" || r.metric === "expense" || r.metric === "profit") {
        targetMap[r.metric] = Number(r.amount_cents);
      }
    }
  }
  const budgetActuals = {
    revenue: monthPnl.netRevenueCents,
    expense: monthPnl.totalExpenseCents,
    profit: monthPnl.profitCents,
  };

  const hasMonth = monthTxns.length > 0;
  const showSaaS = hasMonth || saas.mrrCents > 0 || saas.activeClients > 0;
  const monthLabel = now.toLocaleDateString(tag, { month: "long", year: "numeric" });
  const mrrUp = saas.mrrCents >= saas.prevMrrCents;
  const mrrDelta = deltaLabel(saas.mrrCents, saas.prevMrrCents, tr("rep.vsLastWeek"));
  const slot = 560 / weeks.length;
  const barW = Math.min(40, slot * 0.5);

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="reports" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nav.reports")}</h1>
            <div className="sub">{periodSub} · {org.name}</div>
          </div>
          <div className="actions">
            {can(plan, "weeklyReports") && session.user.email && (
              <SendReportButton week={week} email={session.user.email} locale={locale} />
            )}
            <PrintButton label="PDF" />
            <SignOutButton locale={locale} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head" style={{ marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <h3>{periodTitle}</h3>
            <div className="seg rep-seg">
              <Link className={period === "week" ? "on" : ""} href="/app/reports?period=week">{tr("rep.segWeek")}</Link>
              <Link className={period === "month" ? "on" : ""} href="/app/reports?period=month">{tr("rep.segMonth")}</Link>
              <Link className={period === "3m" ? "on" : ""} href="/app/reports?period=3m">{tr("rep.seg3m")}</Link>
            </div>
          </div>

          {period === "week" ? (
            <>
              <div className="rep-nav">
                {week < MAX_WEEKS_BACK ? (
                  <Link className="rep-arrow" href={`/app/reports?week=${week + 1}`}>{tr("rep.earlier")}</Link>
                ) : (
                  <span className="rep-arrow disabled">{tr("rep.earlier")}</span>
                )}
                <div className="rep-period">
                  <b>{data.periodLabel}</b>
                  <span>{relLabel}</span>
                </div>
                {week > 0 ? (
                  <Link className="rep-arrow" href={`/app/reports?week=${week - 1}`}>{tr("rep.later")}</Link>
                ) : (
                  <span className="rep-arrow disabled">{tr("rep.later")}</span>
                )}
              </div>

              {data.hasActivity ? (
                <ReportSummary week={week} locale={locale} />
              ) : (
                <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--ink-faint)" }}>
                  <div style={{ fontSize: 15, marginBottom: 6, color: "var(--ink-soft)" }}>{tr("rep.noWeekOps")}</div>
                  <div style={{ fontSize: 13.5 }}>{tr("rep.pickWeek")}</div>
                </div>
              )}
            </>
          ) : periodTxns.length > 0 ? (
            <>
              <div style={{ fontSize: 13.5, color: "var(--ink-faint)", marginBottom: 14, textTransform: "capitalize" }}>{periodLabel}</div>
              <div className="grid-3" style={{ marginBottom: 6, gap: 14 }}>
                <div><div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("rep.revenue")}</div><div style={{ fontSize: 23, fontWeight: 600 }}>{formatMoney(periodPnl.netRevenueCents, cur)}</div></div>
                <div><div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("rep.netProfit")}</div><div style={{ fontSize: 23, fontWeight: 600, color: periodPnl.profitCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>{formatMoney(periodPnl.profitCents, cur)}</div></div>
                <div><div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("rep.expenses")}</div><div style={{ fontSize: 23, fontWeight: 600 }}>{formatMoney(periodPnl.totalExpenseCents, cur)}</div></div>
              </div>
              {periodTop.length > 0 && (
                <>
                  <div className="rep-section" style={{ margin: "18px 0 10px" }}>{tr("rep.whereMoney")}</div>
                  <div className="brk">
                    {periodTop.map((e) => {
                      const pct = periodPnl.totalExpenseCents > 0 ? Math.round((e.totalCents / periodPnl.totalExpenseCents) * 100) : 0;
                      return (
                        <div className="brk-item" key={e.category}>
                          <div className="bl"><b>{e.category}</b><span>{formatMoney(e.totalCents, cur)} · {pct}%</span></div>
                          <div className="bar"><i style={{ width: `${pct}%`, background: "var(--accent)" }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--ink-faint)" }}>
              <div style={{ fontSize: 15, marginBottom: 6, color: "var(--ink-soft)" }}>{tr("rep.noPeriodOps")}</div>
              <div style={{ fontSize: 13.5 }}>{tr("rep.loadOrConnect")}</div>
            </div>
          )}
        </div>

        {showSaaS && (
          <>
            <div className="grid-4">
              <div className="mtile">
                <div className="ml">MRR</div>
                <div className="mv">{formatMoney(saas.mrrCents, cur)}</div>
                {mrrDelta && <div className={`md ${mrrUp ? "up" : "down"}`}>{mrrDelta}</div>}
                {sparkline(mrrSeries)}
              </div>
              <div className="mtile">
                <div className="ml">{tr("rep.activeClients")}</div>
                <div className="mv">{saas.activeClients}</div>
                <div className="md muted">{realSubs ? tr("rep.payingNow") : tr("rep.payingMonth")}</div>
                {sparkline(clientsSeries, "#3E9C7C")}
              </div>
              <div className="mtile">
                <div className="ml">ARPU</div>
                <div className="mv">{formatMoney(saas.arpuCents, cur)}</div>
                <div className="md muted">{tr("rep.arpuSub")}</div>
                {sparkline(arpuSeries, "#6BB89E")}
              </div>
              <div className="mtile">
                <div className="ml">{realSubs ? tr("rep.ltv") : tr("rep.ltvEst")}</div>
                <div className="mv">~{formatMoney(saas.ltvCents, cur)}</div>
                <div className="md muted">{realSubs && saas.churnPct !== undefined ? tr("rep.churn", { n: saas.churnPct.toFixed(1) }) : tr("rep.retention", { n: saas.retentionMonths })}</div>
                {sparkline(arpuSeries, "#8FCBB0")}
              </div>
            </div>

            <div className="cap" style={{ marginTop: -2, marginBottom: 6 }}>
              {realSubs ? (
                <span>{tr("rep.metricsReal")}</span>
              ) : (
                <span>{tr("rep.metricsEstPre")} <Link href="/app/integrations" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{tr("rep.metricsEstLink")}</Link>{tr("rep.metricsEstPost")}</span>
              )}
            </div>

            <div className="grid-2">
              <div className="panel">
                <div className="panel-head"><h3>{tr("rep.revByWeek")}</h3><span className="muted" style={{ fontSize: 12.5 }}>{tr("rep.sixWeeks")}</span></div>
                <svg viewBox="0 0 560 200" style={{ width: "100%", height: "auto", display: "block" }}>
                  <g stroke="#ECEAE3" strokeWidth="1">
                    {[30, 75, 120, 175].map((y) => <line key={y} x1="0" y1={y} x2="560" y2={y} />)}
                  </g>
                  {weeks.map((w, i) => {
                    const x = i * slot + (slot - barW) / 2;
                    const top = 175 - (w.revenueCents / maxWeekRev) * 145;
                    return <rect key={i} x={x} y={top} width={barW} height={Math.max(175 - top, 2)} rx="3" fill={SHADES[i] ?? "#1F7A5C"} />;
                  })}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-around", fontSize: 11.5, color: "var(--ink-faint)", marginTop: 6 }}>
                  {weeks.map((w, i) => <span key={i}>{w.label}</span>)}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head"><h3>{tr("rep.profitOf", { label: relLabel.toLowerCase() })}</h3><span className="muted" style={{ fontSize: 12.5 }}>{data.periodLabel}</span></div>
                <div className="grid-3" style={{ marginBottom: 6, gap: 10 }}>
                  <div><div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("rep.revenue")}</div><div style={{ fontSize: 21, fontWeight: 600 }}>{formatMoney(data.pnl.netRevenueCents, cur)}</div></div>
                  <div><div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("rep.net")}</div><div style={{ fontSize: 21, fontWeight: 600, color: "var(--accent-ink)" }}>{formatMoney(data.pnl.profitCents, cur)}</div></div>
                  <div><div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("rep.expenses")}</div><div style={{ fontSize: 21, fontWeight: 600 }}>{formatMoney(data.pnl.totalExpenseCents, cur)}</div></div>
                </div>
                {data.topExpenses.length > 0 && (
                  <>
                    <div className="rep-section" style={{ margin: "16px 0 10px" }}>{tr("rep.whereMoney")}</div>
                    <div className="brk">
                      {data.topExpenses.map((e) => {
                        const pct = data.pnl.totalExpenseCents > 0 ? Math.round((e.totalCents / data.pnl.totalExpenseCents) * 100) : 0;
                        return (
                          <div className="brk-item" key={e.label}>
                            <div className="bl"><b>{e.label}</b><span>{formatMoney(e.totalCents, cur)} · {pct}%</span></div>
                            <div className="bar"><i style={{ width: `${pct}%`, background: "var(--accent)" }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {week === 0 && (
                  data.gapDate ? (
                    <div className="note warn">
                      <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                      <span><strong>{tr("rep.gapWarn", { date: formatGapDate(data.gapDate, tag) })}</strong> {tr("rep.gapBody", { bal: formatMoney(data.gapBalanceCents ?? 0, cur) })}</span>
                    </div>
                  ) : (
                    <div className="note ok">
                      <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                      <span><strong>{tr("rep.okTitle")}</strong> {tr("rep.okBody")}</span>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>{tr("rep.aiInsights")}</h3><span className="muted" style={{ fontSize: 12.5 }}>{tr("rep.fromZori", { month: monthLabel })}</span></div>
              <div className="grid-3" style={{ marginBottom: 0 }}>
                {insights.map((ins, i) => (
                  <div key={i} className={`note ${ins.tone}`} style={{ margin: 0, flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: ins.tone === "ok" ? "var(--accent-ink)" : ins.tone === "warn" ? "#5E3B10" : "var(--ink)" }}>
                      {insightIcon(ins.tone)}{ins.title}
                    </div>
                    <span style={{ marginTop: 6 }}>{ins.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <MrrWaterfall orgId={org.id} locale={locale} />
            </div>

            <div style={{ marginTop: 16 }}>
              <RecurringExpenses orgId={org.id} locale={locale} />
            </div>

            <div style={{ marginTop: 16 }}>
              <AnomaliesPanel orgId={org.id} locale={locale} />
            </div>

            {isGrowthPlus(plan) && (
              <div style={{ marginTop: 16 }}>
                <ConcentrationPanel orgId={org.id} locale={locale} />
              </div>
            )}

            {can(plan, "benchmarks") && (
              <div style={{ marginTop: 16 }}>
                <BenchmarksPanel orgId={org.id} industry={org.industry} locale={locale} />
              </div>
            )}
          </>
        )}

        {isGrowthPlus(plan) && (
          <div style={{ marginTop: 16 }}>
            <BudgetVsActual
              month={curMonth}
              monthLabel={monthLabel}
              currency={cur}
              dayOfMonth={now.getUTCDate()}
              daysInMonth={daysInMonth}
              actuals={budgetActuals}
              targets={targetMap}
              locale={locale}
            />
          </div>
        )}
      </main>
    </div>
  );
}
