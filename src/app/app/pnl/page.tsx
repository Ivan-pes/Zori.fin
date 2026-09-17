import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { PrintButton } from "@/components/PrintButton";
import { loadTransactions } from "@/lib/transactions";
import { computePnL, expensesByCategory } from "@/lib/metrics/engine";
import { getOrgPlan } from "@/lib/billing/plan";
import { earliestAllowed } from "@/lib/billing/history";
import { computeVariance } from "@/lib/metrics/variance";
import { VarianceBlock } from "@/components/VarianceBlock";
import { topVendors } from "@/lib/metrics/vendors";
import { TopVendors } from "@/components/TopVendors";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag, type Locale } from "@/lib/i18n";
import type { NormalizedTransaction } from "@/types";

type Period = "month" | "quarter" | "year";

function periodRange(p: Period, monthParam: string | null, tag: string, t: (k: string, v?: Record<string, string | number>) => string): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (p === "year") {
    const to = new Date(now.getTime() + 86_400_000);
    return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to, label: t("pnl.yearLabel", { y: now.getUTCFullYear() }) };
  }
  if (p === "quarter") {
    const to = new Date(now.getTime() + 86_400_000);
    const q = Math.floor(now.getUTCMonth() / 3);
    return { from: new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1)), to, label: `Q${q + 1} ${now.getUTCFullYear()}` };
  }
  const from = monthParam
    ? new Date(Date.UTC(+monthParam.slice(0, 4), +monthParam.slice(5, 7) - 1, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return { from, to, label: from.toLocaleDateString(tag, { month: "long", year: "numeric" }) };
}

function monthlyBuckets(txns: NormalizedTransaction[], months: number, anchor: Date, tag: string) {
  const buckets: { key: string; label: string; items: NormalizedTransaction[] }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
    buckets.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: d.toLocaleDateString(tag, { month: "short" }), items: [] });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const t of txns) {
    const d = t.occurredAt;
    const i = idx.get(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
    if (i !== undefined) buckets[i]!.items.push(t);
  }
  return buckets.map((b) => {
    const p = computePnL(b.items);
    return { label: b.label, revenueCents: p.netRevenueCents, profitCents: p.profitCents };
  });
}

export default async function PnlPage({ searchParams }: { searchParams: Promise<{ period?: string; month?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const [org] = await sql<{ id: string; name: string }[]>`
    select id, name from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const locale: Locale = await getLocale();
  const tr = translator(locale);
  const tag = localeTag(locale);
  const PERIODS: { v: Period; l: string }[] = [
    { v: "month", l: tr("pnl.pMonth") },
    { v: "quarter", l: tr("pnl.pQuarter") },
    { v: "year", l: tr("pnl.pYear") },
  ];

  const sp = await searchParams;
  const period: Period = sp.period === "quarter" || sp.period === "year" ? sp.period : "month";
  const monthParam = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : null;
  const { from: rawFrom, to, label } = periodRange(period, monthParam, tag, tr);

  const { plan } = await getOrgPlan(org.id);
  const floor = earliestAllowed(plan);
  const from = floor && rawFrom < floor ? floor : rawFrom;

  const now0 = new Date();
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const prevYm = ym(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1)));
  const nextYm = ym(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)));
  const isCurrentMonth = from.getUTCFullYear() === now0.getUTCFullYear() && from.getUTCMonth() === now0.getUTCMonth();

  const txns = await loadTransactions(org.id, { from, to });
  const pnl = computePnL(txns);
  const cur = pnl.currency;
  const cats = expensesByCategory(txns);

  const monthsBack = period === "year" ? 12 : period === "quarter" ? 3 : 1;
  let prevFrom = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - monthsBack, 1));
  if (floor && prevFrom < floor) prevFrom = floor;
  const showAnalytics = plan !== "free";
  const prevTxns = showAnalytics ? await loadTransactions(org.id, { from: prevFrom, to: from }) : [];
  const variance = showAnalytics ? computeVariance(txns, prevTxns) : null;
  const vendors = showAnalytics ? topVendors(txns, prevTxns) : [];
  const prevLabel = monthsBack === 1 ? tr("pnl.prevM") : monthsBack === 3 ? tr("pnl.prevQ") : tr("pnl.prevY");
  const topIncome = txns
    .filter((t) => t.direction === "income")
    .sort((a, b) => b.grossCents - a.grossCents)
    .slice(0, 3);

  const anchor = period === "month" ? from : new Date(Date.UTC(now0.getUTCFullYear(), now0.getUTCMonth(), 1));
  const rawChartFrom = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 5, 1));
  const chartFrom = floor && rawChartFrom < floor ? floor : rawChartFrom;
  const chartTo = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
  const chartTxns = await loadTransactions(org.id, { from: chartFrom, to: chartTo });
  const months = monthlyBuckets(chartTxns, 6, anchor, tag);
  const maxRev = Math.max(...months.map((m) => m.revenueCents), 1);

  const CW = 320, CH = 185, PAD = 8;
  const barW = 22;
  const slot = (CW - PAD * 2) / months.length;
  const yOf = (c: number) => CH - (Math.max(c, 0) / maxRev) * (CH - 30);

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="pnl" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nav.pnl")}</h1>
            {period === "month" ? (
              <div className="sub" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Link href={`/app/pnl?period=month&month=${prevYm}`} className="month-nav" aria-label={tr("pnl.prevMonth")}>←</Link>
                <span style={{ minWidth: 92, textAlign: "center", fontWeight: 600, color: "var(--ink)", textTransform: "capitalize" }}>{label}</span>
                {isCurrentMonth ? (
                  <span className="month-nav" style={{ opacity: 0.3, cursor: "default" }}>→</span>
                ) : (
                  <Link href={`/app/pnl?period=month&month=${nextYm}`} className="month-nav" aria-label={tr("pnl.nextMonth")}>→</Link>
                )}
                <span style={{ color: "var(--ink-faint)" }}>· {tr("pnl.fromTx")}</span>
              </div>
            ) : (
              <div className="sub">{tr("pnl.subFull")}</div>
            )}
          </div>
          <div className="actions">
            <div className="seg">
              {PERIODS.map((p) => (
                <Link key={p.v} href={`/app/pnl?period=${p.v}`} className={period === p.v ? "on" : ""}>{p.l}</Link>
              ))}
            </div>
            <PrintButton label={tr("common.export")} />
            <SignOutButton locale={locale} />
          </div>
        </div>

        <div className="grid-3">
          <div className="kpi">
            <div className="k-top"><span className="k-lbl">{tr("pnl.revenuePeriod", { label })}</span></div>
            <div className="k-val">{formatMoney(pnl.netRevenueCents, cur)}</div>
          </div>
          <div className="kpi">
            <div className="k-top"><span className="k-lbl">{tr("pnl.grossProfit")}</span></div>
            <div className="k-val">{formatMoney(pnl.netRevenueCents, cur)}</div>
            <div className="k-delta muted">{tr("pnl.noCogs")}</div>
          </div>
          <div className="kpi">
            <div className="k-top"><span className="k-lbl">{tr("pnl.netProfit")}</span></div>
            <div className="k-val" style={{ color: pnl.profitCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>{formatMoney(pnl.profitCents, cur)}</div>
            <div className={`k-delta ${pnl.profitCents >= 0 ? "up" : "down"}`}>{tr("pnl.margin", { m: pnl.marginPct.toFixed(1) })}</div>
          </div>
        </div>

        <div className="grid-2">
          <div className="panel">
            <div className="panel-head"><h3>{tr("pnl.reportTitle", { label })}</h3></div>
            {txns.length === 0 ? (
              <p style={{ color: "var(--ink-faint)", fontSize: 14, padding: "8px 0" }}>{tr("pnl.noOps")}</p>
            ) : (
              <>
                <div className="pnl-row head"><span>{tr("pnl.colItem")}</span><span>{tr("pnl.colAmount")}</span></div>
                <div className="pnl-row"><span>{tr("pnl.revenue")}</span><span className="v">{formatMoney(pnl.revenueCents, cur)}</span></div>
                {topIncome.map((t) => (
                  <div className="pnl-row sub" key={t.id}><span>{t.description ?? tr("pnl.payment")}</span><span className="v">{formatMoney(t.grossCents, cur)}</span></div>
                ))}
                {pnl.refundCents > 0 && (
                  <div className="pnl-row sub"><span>{tr("pnl.refunds")}</span><span className="v">−{formatMoney(pnl.refundCents, cur)}</span></div>
                )}
                <div className="pnl-row"><span>{tr("pnl.cogs")}</span><span className="v">{formatMoney(0, cur)}</span></div>
                <div className="pnl-row total"><span>{tr("pnl.grossProfit")}</span><span className="v">{formatMoney(pnl.netRevenueCents, cur)}</span></div>
                <div className="pnl-row"><span>{tr("pnl.opex")}</span><span className="v">−{formatMoney(pnl.totalExpenseCents, cur)}</span></div>
                {pnl.feeCents > 0 && (
                  <div className="pnl-row sub"><span>{tr("pnl.stripeFees")}</span><span className="v">{formatMoney(pnl.feeCents, cur)}</span></div>
                )}
                {cats.map((c) => (
                  <div className="pnl-row sub" key={c.category}><span>{c.category}</span><span className="v">{formatMoney(c.totalCents, cur)}</span></div>
                ))}
                <div className="pnl-row total"><span>{tr("pnl.netProfit")}</span><span className="v" style={{ color: pnl.profitCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>{formatMoney(pnl.profitCents, cur)}</span></div>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>{tr("pnl.byMonth")}</h3></div>
            <svg viewBox={`0 0 ${CW} 210`} style={{ width: "100%", height: "auto", display: "block" }}>
              <g stroke="#ECEAE3" strokeWidth="1">
                {[0, 1, 2, 3].map((k) => { const y = 30 + (k / 3) * (CH - 30); return <line key={k} x1="0" y1={y} x2={CW} y2={y} />; })}
              </g>
              {months.map((m, i) => {
                const x = PAD + i * slot + (slot - barW) / 2;
                const y = yOf(m.revenueCents);
                const h = Math.max(CH - y, 2);
                const shade = ["#C9C4B6", "#8FCBB0", "#6BB89E", "#3E9C7C", "#2E8E6C", "#1F7A5C"][i] ?? "#1F7A5C";
                return <rect key={i} x={x} y={y} width={barW} height={h} rx="3" fill={shade} />;
              })}
              <polyline
                points={months.map((m, i) => `${PAD + i * slot + slot / 2},${yOf(m.profitCents)}`).join(" ")}
                fill="none" stroke="#0E5A41" strokeWidth="2" strokeDasharray="2 5"
              />
              {months.map((m, i) => (
                <circle key={i} cx={PAD + i * slot + slot / 2} cy={yOf(m.profitCents)} r="3" fill="#0E5A41" />
              ))}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-around", fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>
              {months.map((m, i) => <span key={i}>{m.label}</span>)}
            </div>
            <div className="pnl-legend">
              <span><i className="bar-rev" />{tr("pnl.revenue")}</span>
              <span><i className="bar-profit" />{tr("pnl.profit")}</span>
            </div>
          </div>
        </div>

        {variance && (
          <div style={{ marginTop: 16 }}>
            <VarianceBlock variance={variance} prevLabel={prevLabel} locale={locale} />
          </div>
        )}

        {showAnalytics && (
          <div style={{ marginTop: 16 }}>
            <TopVendors vendors={vendors} currency={cur} prevLabel={prevLabel} locale={locale} />
          </div>
        )}
      </main>
    </div>
  );
}
