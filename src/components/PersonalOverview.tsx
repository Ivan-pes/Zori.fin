import { getPersonalOverview, getLiquidAccounts, liquidTotalBaseCents } from "@/lib/personal/data";
import { getCategorySignals } from "@/lib/metrics/categorySignalsData";
import { loadPlannedItems } from "@/lib/planned/load";
import { expandPlanned } from "@/lib/metrics/planned";
import { SafeToSpendCard } from "@/components/SafeToSpendCard";
import { MyMoneyCard } from "@/components/MyMoneyCard";
import { MyIncomeCard } from "@/components/MyIncomeCard";
import { KpiQuickAdd, type KpiDetail } from "@/components/KpiQuickAdd";
import { getCategoriesFor } from "@/lib/categorize/custom";
import { SignalFeed } from "@/components/SignalFeed";
import { HideBillButton } from "@/components/HideBillButton";
import { RemoveManualSubButton } from "@/components/RemoveManualSubButton";
import { DashboardChat } from "@/components/DashboardChat";
import { SignOutButton } from "@/components/SignOutButton";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag, type Locale } from "@/lib/i18n";
import { categoryLabel } from "@/lib/i18n/categories";

export async function PersonalOverview({
  orgId,
  orgName,
  locale,
  monthParam = null,
}: {
  orgId: string;
  orgName: string;
  locale: Locale;
  /** ?month=YYYY-MM — смотреть обзор за конкретный месяц (листание). */
  monthParam?: string | null;
}) {
  const tr = translator(locale);
  const tag = localeTag(locale);

  // Ретроспектива за выбранный месяц; без параметра — последний с данными.
  const asOf = monthParam
    ? new Date(Date.UTC(+monthParam.slice(0, 4), +monthParam.slice(5, 7), 0, 23, 59, 59))
    : new Date();
  const [data, accounts, catSignals, categories] = await Promise.all([
    getPersonalOverview(orgId, asOf),
    getLiquidAccounts(orgId),
    getCategorySignals(orgId, asOf, locale).catch(() => null),
    getCategoriesFor(orgId),
  ]);
  const watchCats = catSignals?.signals.filter((s) => s.status !== "healthy") ?? [];

  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const shownYm = monthParam ?? ym(data?.reportMonth ?? new Date());
  const [sy, sm] = shownYm.split("-").map(Number);
  const prevYm = ym(new Date(Date.UTC(sy!, sm! - 2, 1)));
  const nextYm = ym(new Date(Date.UTC(sy!, sm!, 1)));
  const nowYm = ym(new Date());
  // Архивный просмотр: блоки «про сейчас» (можно потратить, счета) скрываем.
  const browsing = monthParam !== null && monthParam !== nowYm;
  // Месяц для ретроспективных KPI — последний с данными (а не пустой текущий).
  const month = (data?.reportMonth ?? new Date()).toLocaleDateString(tag, { month: "long" });

  const cur = data?.currency ?? "EUR";
  const savings = data?.savings;
  const totalSpend = data?.breakdown.reduce((s, b) => s + b.totalCents, 0) ?? 0;
  // «Всего на счетах» — сумма счетов, приведённая к базовой валюте (счета могут быть в разных).
  const liquidBaseCents = await liquidTotalBaseCents(orgId, cur);

  // Плановые траты из календаря на 30 дней вперёд: ещё НЕ в фактических тратах
  // месяца, но человеку полезно видеть, сколько уже «висит» впереди (напр. квартплата).
  const nowD = new Date();
  const plannedAheadCents = browsing
    ? 0
    : expandPlanned(await loadPlannedItems(orgId), nowD, new Date(nowD.getTime() + 30 * 86_400_000))
        .filter((o) => o.direction === "expense")
        .reduce((s, o) => s + o.amountCents, 0);
  const SHADES = ["var(--accent)", "#3E9C7C", "#6BB89E", "var(--warn)", "#C9C4B6"];

  // «Мало на счету»: нечего свободно тратить или остаток уже ниже буфера.
  const atRisk = !!data && (data.sts.totalCents === 0 || (data.ctx.balanceCents ?? 0) < (data.ctx.bufferCents ?? 0));

  // Данные для раскрывающихся сводок под KPI (клик по цифре → расшифровка).
  const incomeDetail: KpiDetail | undefined = savings && data
    ? { kind: "income", items: data.incomeBreakdown.slice(0, 5), totalCents: savings.incomeCents, ratePct: savings.incomeCents > 0 ? savings.ratePct : null }
    : undefined;
  const expenseDetail: KpiDetail | undefined = data
    ? { kind: "expense", items: data.breakdown.slice(0, 5).map((b) => ({ category: b.category, totalCents: b.totalCents })), totalCents: totalSpend, plannedAheadCents }
    : undefined;
  const savingsDetail: KpiDetail | undefined = savings
    ? { kind: "savings", incomeCents: savings.incomeCents, spendingCents: savings.spendingCents, savedCents: savings.savedCents, ratePct: savings.incomeCents > 0 ? savings.ratePct : null }
    : undefined;
  const balanceDetail: KpiDetail = {
    kind: "balance",
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, balanceCents: a.balanceCents, currency: a.currency })),
    bufferCents: data?.ctx.bufferCents ?? 0,
    totalBaseCents: liquidBaseCents,
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{orgName}</h1>
          <div className="sub">{tr("ps.overviewSub")}</div>
        </div>
        <div className="actions">
          <a className="btn btn-line btn-sm" href={`/app?month=${prevYm}`}>←</a>
          {browsing && <a className="btn btn-line btn-sm" href="/app">{tr("mon.now")}</a>}
          <a className="btn btn-line btn-sm" href={`/app?month=${nextYm}`}>→</a>
          <SignOutButton locale={locale} />
        </div>
      </div>

      <div className="kpi-row">
        <KpiQuickAdd
          kind="income"
          label={tr("ps.kpiIncome", { month })}
          valueCents={savings?.incomeCents ?? 0}
          currency={cur}
          locale={locale}
          detail={incomeDetail}
        />
        <KpiQuickAdd
          kind="expense"
          label={tr("ps.kpiSpending", { month })}
          valueCents={savings?.spendingCents ?? 0}
          currency={cur}
          locale={locale}
          categories={categories}
          detail={expenseDetail}
          deltaNode={plannedAheadCents > 0 ? (
            <div className="k-delta" style={{ color: "var(--warn)" }} title={tr("ps.plannedAheadHint")}>
              +{formatMoney(plannedAheadCents, cur)} {tr("ps.plannedAhead")}
            </div>
          ) : null}
        />
        <KpiQuickAdd
          kind="savings"
          label={tr("ps.kpiSaved")}
          valueCents={savings?.savedCents ?? 0}
          currency={cur}
          locale={locale}
          valueColor={(savings?.savedCents ?? 0) >= 0 ? "var(--accent-ink)" : "var(--danger)"}
          detail={savingsDetail}
          deltaNode={savings && savings.incomeCents > 0 ? <div className="k-delta up">{tr("ps.savingsRate", { pct: savings.ratePct })}</div> : null}
        />
        <KpiQuickAdd
          kind="balance"
          label={tr("ps.kpiBalance")}
          valueCents={data?.ctx.balanceCents ?? 0}
          currency={cur}
          locale={locale}
          detail={balanceDetail}
          deltaNode={data?.ctx.bufferCents ? <div className="k-delta up">{tr("ps.bufferOf", { amount: formatMoney(data.ctx.bufferCents, cur) })}</div> : null}
        />
      </div>

      <div className="grid-2">
        {data && !browsing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <SafeToSpendCard sts={data.sts} currency={cur} nextPayday={data.nextPayday} locale={locale} />
            <MyIncomeCard
              salaryCents={data.ctx.salaryCents}
              extraIncomeCents={data.ctx.extraIncomeCents}
              spendTargetPct={data.ctx.spendTargetPct}
              paydayDay={data.ctx.paydayDay}
              currency={cur}
              locale={locale}
            />
            <MyMoneyCard accounts={accounts} currency={cur} totalBaseCents={liquidBaseCents} locale={locale} />
            {watchCats.length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <h3>{tr("catsig.attention")}</h3>
                  <Link href="/app/categories" style={{ fontSize: 12.5, color: "var(--accent-ink)", fontWeight: 600 }}>{tr("nav.categories")} →</Link>
                </div>
                <SignalFeed signals={watchCats} limit={3} locale={locale} />
              </div>
            )}
            {atRisk && (
              <div className="note warn" style={{ marginTop: 0 }}>
                <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                <span><strong>{tr("ps.lowBalance")}</strong><br /><span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{tr("ps.alertEmailHint")}</span></span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="panel">
              <div className="panel-head">
                <h3>{tr("catsig.attention")}</h3>
                <Link href={`/app/categories?month=${shownYm}`} style={{ fontSize: 12.5, color: "var(--accent-ink)", fontWeight: 600 }}>{tr("nav.categories")} →</Link>
              </div>
              <SignalFeed signals={watchCats} limit={4} locale={locale} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="panel assist assist-tall" style={{ flex: 1, minHeight: 0 }}>
            <div className="panel-head">
              <h3>{tr("nav.assistant")}</h3>
              <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>● {tr("ov.online")}</span>
            </div>
            <DashboardChat locale={locale} variant="personal" currency={cur} />
          </div>

          {/* Темп месяца: потрачено % плана против прошедшего % месяца */}
          {data && !browsing && data.sts.mode === "target" && (data.sts.spendTargetCents ?? 0) > 0 && (() => {
            const target = data.sts.spendTargetCents!;
            const spentPct = Math.min(100, Math.round(((data.sts.spentThisMonthCents ?? 0) / target) * 100));
            const daysInMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
            const monthPct = Math.min(100, Math.round((nowD.getDate() / daysInMonth) * 100));
            const ahead = spentPct > monthPct + 5;
            return (
              <div className="panel">
                <div className="panel-head">
                  <h3>{tr("ps.paceTitle")}</h3>
                  <Link href="/app/budgets" style={{ fontSize: 12.5, color: "var(--accent-ink)", fontWeight: 600 }}>{tr("bud.title")} →</Link>
                </div>
                <div className="pace-bar" role="img" aria-label={tr("ps.paceLine", { spent: spentPct, month: monthPct })}>
                  <i style={{ width: `${spentPct}%`, background: ahead ? "var(--warn)" : "var(--accent)" }} />
                  <span className="pace-mark" style={{ left: `${monthPct}%` }} title={tr("ps.paceMonthMark", { pct: monthPct })} />
                </div>
                <div className="pace-line">{tr("ps.paceLine", { spent: spentPct, month: monthPct })}</div>
                <div className="pace-status" style={{ color: ahead ? "var(--warn)" : "var(--accent-ink)" }}>
                  {ahead ? tr("ps.paceAhead") : tr("ps.paceOk")}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>{tr("rep.whereMoney")}</h3><span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{month}</span></div>
          {data && data.breakdown.length > 0 ? (
            <div className="brk">
              {data.breakdown.slice(0, 6).map((b, i) => {
                const pct = totalSpend > 0 ? Math.round((b.totalCents / totalSpend) * 100) : 0;
                return (
                  <div className="brk-item" key={b.category}>
                    <div className="bl"><b>{categoryLabel(b.category, locale)}</b><span>{formatMoney(b.totalCents, cur)} · {pct}%</span></div>
                    <div className="bar"><i style={{ width: `${Math.max(pct, 2)}%`, background: SHADES[i] ?? "#C9C4B6" }} /></div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("rep.loadOrConnect")}</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h3>{tr("ps.upcomingBills")}</h3><Link href="/app/subscriptions" style={{ fontSize: 13, color: "var(--accent-ink)", fontWeight: 600 }}>{tr("subs.nav")} →</Link></div>
          {data && data.bills.length > 0 ? (
            <table className="tx-table tx-full">
              <tbody>
                {data.bills.slice(0, 6).map((b, i) => (
                  <tr key={`${b.label}-${i}`}>
                    <td><span className="tx-name">{b.label}</span></td>
                    <td style={{ color: b.stale ? "var(--warn)" : "var(--ink-faint)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {b.stale ? tr("ps.notUsed", { n: b.daysSinceLast }) : tr("ps.inDays", { n: b.daysUntil, date: b.dueDate.toLocaleDateString(tag, { day: "numeric", month: "short" }) })}
                    </td>
                    <td className="amt neg">−{formatMoney(b.amountCents, cur)}</td>
                    <td style={{ width: 26, textAlign: "right" }}>
                      {b.manualId
                        ? <RemoveManualSubButton manualId={b.manualId} locale={locale} />
                        : b.matchKey && <HideBillButton matchKey={b.matchKey} locale={locale} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("ps.noBills")}</p>
          )}
        </div>
      </div>
    </>
  );
}
