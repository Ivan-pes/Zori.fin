import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";
import type { SafeToSpend } from "@/lib/metrics/safeToSpend";

export function SafeToSpendCard({
  sts,
  currency = "EUR",
  nextPayday,
  locale = DEFAULT_LOCALE,
}: {
  sts: SafeToSpend;
  currency?: string;
  nextPayday: Date | null;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const tag = localeTag(locale);
  const paydayStr = nextPayday
    ? nextPayday.toLocaleDateString(tag, { day: "numeric", month: "long" })
    : null;

  // Прогресс периода: длина цикла = месяц до periodEnd (а не жёсткие 30 дней),
  // иначе за неделю до зарплаты полоса показывала бы «77%» при любом цикле.
  const cycleStart = new Date(sts.periodEnd);
  cycleStart.setUTCMonth(cycleStart.getUTCMonth() - 1);
  const cycleDays = Math.max(1, Math.round((sts.periodEnd.getTime() - cycleStart.getTime()) / 86_400_000));
  const pct = Math.min(100, Math.max(0, Math.round(((cycleDays - sts.daysLeft) / cycleDays) * 100)));

  return (
    <div className="sts">
      <div className="glow" />
      <div className="lbl">{tr("ps.stsLabel")}</div>
      <div className="big">{formatMoney(sts.totalCents, currency)}</div>
      <div className="cap">
        {paydayStr ? tr("ps.stsCap", { date: paydayStr }) : tr("ps.stsCapNoPayday")}
      </div>
      {sts.mode === "target" && sts.spendTargetCents != null && (
        <div className="cap" style={{ marginTop: 2 }}>
          {tr("ps.planLine", {
            target: formatMoney(sts.spendTargetCents, currency),
            spent: formatMoney(sts.spentThisMonthCents ?? 0, currency),
          })}
        </div>
      )}

      {/* Полоса месяца: потрачено / можно / в сбережения — от дохода */}
      {sts.mode === "target" && (sts.monthlyIncomeCents ?? 0) > 0 && (() => {
        const income = sts.monthlyIncomeCents!;
        const spent = Math.min(sts.spentThisMonthCents ?? 0, income);
        const can = Math.min(sts.totalCents, Math.max(0, income - spent));
        const save = Math.max(0, income - spent - can);
        const w = (c: number) => `${Math.max(0, (c / income) * 100)}%`;
        return (
          <>
            <div className="sts-bar" role="img" aria-label={`${tr("sts.hSpent")}, ${tr("sts.hCan")}, ${tr("sts.hSave")}`}>
              <i className="sp" style={{ width: w(spent) }} />
              <i className="cn" style={{ width: w(can) }} />
              <i className="sv" style={{ width: w(save) }} />
            </div>
            <div className="sts-bar-lbl">
              <span><span className="d" style={{ background: "var(--ink-faint)" }} /> {tr("sts.hSpent")} <b>{formatMoney(spent, currency)}</b></span>
              <span><span className="d" style={{ background: "var(--accent)" }} /> {tr("sts.hCan")} <b>{formatMoney(can, currency)}</b></span>
              <span><span className="d" style={{ background: "#CDE5DC" }} /> {tr("sts.hSave")} <b>{formatMoney(save, currency)}</b></span>
            </div>
          </>
        );
      })()}

      {/* «Как посчитано?» — прозрачная разбивка формулы */}
      <details className="sts-how">
        <summary>{tr("sts.how")}</summary>
        {sts.mode === "target" ? (
          <div className="rows">
            <div className="r"><span>{tr("sts.fIncome")}</span><b>{formatMoney(sts.monthlyIncomeCents ?? 0, currency)}</b></div>
            <div className="r">
              <span>{tr("sts.fPlan", { pct: Math.round(((sts.spendTargetCents ?? 0) / Math.max(1, sts.monthlyIncomeCents ?? 1)) * 100) })}</span>
              <b>{formatMoney(sts.spendTargetCents ?? 0, currency)}</b>
            </div>
            <div className="r"><span>{tr("sts.fSpent")}</span><b>−{formatMoney(sts.spentThisMonthCents ?? 0, currency)}</b></div>
            {sts.cappedByAvailable && <div className="r warn"><span>{tr("sts.fCapped")}</span><b>{formatMoney(sts.totalCents, currency)}</b></div>}
            <div className="r tot"><span>{tr("sts.fLeft")}</span><b>{formatMoney(sts.totalCents, currency)}</b></div>
          </div>
        ) : (
          <div className="rows">
            <div className="r"><span>{tr("sts.fBalance")}</span><b>{formatMoney(sts.balanceCents, currency)}</b></div>
            <div className="r"><span>{tr("sts.fExpIncome")}</span><b>+{formatMoney(sts.expectedIncomeRemainingCents, currency)}</b></div>
            <div className="r"><span>{tr("sts.fBills")}</span><b>−{formatMoney(sts.committedCents, currency)}</b></div>
            <div className="r"><span>{tr("sts.fBuffer")}</span><b>−{formatMoney(sts.bufferCents, currency)}</b></div>
            <div className="r"><span>{tr("sts.fReserve")}</span><b>−{formatMoney(sts.reserveCents, currency)}</b></div>
            <div className="r tot"><span>{tr("sts.fLeft")}</span><b>{formatMoney(sts.totalCents, currency)}</b></div>
            <div className="r" style={{ marginTop: 6 }}><span style={{ color: "var(--ink-faint)" }}>{tr("sts.noModeHint")}</span></div>
          </div>
        )}
      </details>
      <div className="perday">{tr("ps.perDay", { amount: formatMoney(sts.perDayCents, currency), n: sts.daysLeft })}</div>
      <div className="track">
        <div className="tl">
          <span>{tr("ps.today")}</span>
          <span>{tr("ps.periodPassed", { pct })}</span>
          <span>{paydayStr ?? tr("ps.payday")}</span>
        </div>
        <div className="ptbar"><i style={{ width: `${pct}%` }} /></div>
      </div>
    </div>
  );
}
