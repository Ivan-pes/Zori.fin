import type { ReactNode } from "react";
import type { NormalizedTransaction } from "@/types";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";

const DAY = 86_400_000;

export function MonthCashflowChart({
  txns,
  from,
  to,
  currency = "EUR",
  mode = "month",
  toggle,
  locale = DEFAULT_LOCALE,
}: {
  txns: NormalizedTransaction[];
  from: Date;
  to?: Date;
  currency?: string;
  mode?: "month" | "range";
  toggle?: ReactNode;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const end = to ?? new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const fromMid = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const spanDays = Math.max(1, Math.round((end.getTime() - fromMid) / DAY));

  let monthsCount = 0;
  {
    const m = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (m.getTime() < end.getTime()) {
      monthsCount++;
      m.setUTCMonth(m.getUTCMonth() + 1);
    }
  }

  let incomeCents = 0;
  let expenseCents = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let maxIncome: NormalizedTransaction | null = null;
  let maxExpense: NormalizedTransaction | null = null;
  const dailyNet = new Array<number>(spanDays + 1).fill(0);
  for (const t of txns) {
    const td = new Date(t.occurredAt);
    const offset = Math.floor((Date.UTC(td.getUTCFullYear(), td.getUTCMonth(), td.getUTCDate()) - fromMid) / DAY);
    const bucket = offset + 1;
    if (bucket >= 1 && bucket <= spanDays) dailyNet[bucket]! += t.netCents;
    if (t.direction === "income") {
      incomeCents += t.grossCents;
      incomeCount++;
      if (!maxIncome || t.grossCents > maxIncome.grossCents) maxIncome = t;
    } else {
      expenseCents += t.grossCents;
      expenseCount++;
      if (!maxExpense || t.grossCents > maxExpense.grossCents) maxExpense = t;
    }
  }

  const points: { i: number; cum: number }[] = [{ i: 0, cum: 0 }];
  let cum = 0;
  for (let d = 1; d <= spanDays; d++) {
    cum += dailyNet[d]!;
    points.push({ i: d, cum });
  }
  const endNet = cum;
  const avgPerDayCents = Math.round(endNet / spanDays);
  const clip = (s: string | null) => (s && s.length > 22 ? s.slice(0, 21) + "…" : s ?? "—");

  const title = mode === "range" ? tr("mc.titleRange", { n: monthsCount }) : tr("mc.titleMonth");
  const Head = (
    <div className="panel-head">
      <h3>{title}</h3>
      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12.5, fontWeight: 600 }}>
        {toggle}
        <span style={{ color: "var(--accent-ink)" }}>↑ {formatMoney(incomeCents, currency)}</span>
        <span style={{ color: "var(--danger)" }}>↓ {formatMoney(expenseCents, currency)}</span>
      </div>
    </div>
  );

  if (txns.length === 0) {
    return (
      <div className="panel">
        {Head}
        <p style={{ color: "var(--ink-faint)", fontSize: 14, marginTop: 8 }}>
          {tr("mc.emptyPeriod")}
        </p>
      </div>
    );
  }

  const PL = 56, PR = 700, PT = 24, PB = 210;
  const n = points.length;
  const vals = points.map((p) => p.cum).concat(0);
  let vlo = Math.min(...vals);
  let vhi = Math.max(...vals);
  if (vlo === vhi) vhi = vlo + 100;
  const vpad = (vhi - vlo) * 0.1;
  vlo -= vpad;
  vhi += vpad;
  const xOf = (i: number) => PL + (i / spanDays) * (PR - PL);
  const yOf = (c: number) => PT + (1 - (c - vlo) / (vhi - vlo)) * (PB - PT);

  const linePath = points.map((p) => `${p.i ? "L" : "M"} ${xOf(p.i).toFixed(1)},${yOf(p.cum).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${xOf(spanDays).toFixed(1)},${yOf(Math.max(vlo, Math.min(vhi, 0))).toFixed(1)} L ${xOf(0).toFixed(1)},${yOf(Math.max(vlo, Math.min(vhi, 0))).toFixed(1)} Z`;
  const positive = endNet >= 0;
  const stroke = positive ? "var(--accent)" : "var(--danger)";
  const zeroY = yOf(0);
  const showZero = vlo < 0 && vhi > 0;

  const xticks: { x: number; label: string }[] = [];
  if (mode === "range") {
    const m = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (m.getTime() < end.getTime()) {
      const offset = Math.round((m.getTime() - fromMid) / DAY);
      if (offset >= 0 && offset <= spanDays) {
        xticks.push({ x: xOf(offset), label: m.toLocaleDateString(localeTag(locale), { month: "short" }) });
      }
      m.setUTCMonth(m.getUTCMonth() + 1);
    }
  } else {
    for (const d of [1, Math.round(spanDays / 2), spanDays]) {
      xticks.push({ x: xOf(d), label: String(d) });
    }
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {Head}

      <div className="mc-end" style={{ color: positive ? "var(--accent-ink)" : "var(--danger)" }}>
        {positive ? "+" : "−"}{formatMoney(Math.abs(endNet), currency)}
        <span className="mc-end-l">{mode === "range" ? tr("mc.netChangeRange") : tr("mc.netChangeMonth")}</span>
      </div>

      <svg viewBox="0 0 720 230" preserveAspectRatio="none" style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="mcArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={positive ? "#1F7A5C" : "#B4452E"} stopOpacity=".14" />
            <stop offset="1" stopColor={positive ? "#1F7A5C" : "#B4452E"} stopOpacity="0" />
          </linearGradient>
        </defs>

        <g stroke="#ECEAE3" strokeWidth="1">
          {[0, 1, 2, 3].map((k) => {
            const y = PT + (k / 3) * (PB - PT);
            return <line key={k} x1={PL} y1={y} x2={PR} y2={y} />;
          })}
        </g>
        <g fontFamily="Inter" fontSize="11" fill="#8A8D96" textAnchor="end">
          {[0, 1, 2, 3].map((k) => {
            const y = PT + (k / 3) * (PB - PT);
            const v = vhi - (k / 3) * (vhi - vlo);
            return <text key={k} x={PL - 8} y={y + 4}>{`${Math.round(v / 100).toLocaleString("ru-RU")} €`}</text>;
          })}
        </g>

        {showZero && (
          <line x1={PL} y1={zeroY} x2={PR} y2={zeroY} stroke="#C9C4B6" strokeWidth="1" strokeDasharray="3 4" />
        )}

        <path d={areaPath} fill="url(#mcArea)" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        <circle cx={xOf(spanDays)} cy={yOf(endNet)} r="5" fill={stroke} />
        <circle cx={xOf(spanDays)} cy={yOf(endNet)} r="9" fill={stroke} opacity=".15" />

        <g fontFamily="Inter" fontSize="11" fill="#8A8D96" textAnchor="middle">
          {xticks.map((t, idx) => (
            <text key={idx} x={t.x} y={PB + 18}>{t.label}</text>
          ))}
        </g>
      </svg>

      <div className="mc-stats">
        <div className="mc-s">
          <div className="mc-s-l">{tr("mc.avgPerDay")}</div>
          <div className="mc-s-v" style={{ color: avgPerDayCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>
            {avgPerDayCents >= 0 ? "+" : "−"}{formatMoney(Math.abs(avgPerDayCents), currency)}
          </div>
          <div className="mc-s-sub">{tr("mc.incExp", { inc: incomeCount, exp: expenseCount })}</div>
        </div>
        <div className="mc-s">
          <div className="mc-s-l">{tr("mc.biggestIn")}</div>
          <div className="mc-s-v" style={{ color: "var(--accent-ink)" }}>
            {maxIncome ? formatMoney(maxIncome.grossCents, currency) : "—"}
          </div>
          <div className="mc-s-sub">{maxIncome ? clip(maxIncome.description) : tr("mc.noIncome")}</div>
        </div>
        <div className="mc-s">
          <div className="mc-s-l">{tr("mc.biggestOut")}</div>
          <div className="mc-s-v">{maxExpense ? formatMoney(maxExpense.grossCents, currency) : "—"}</div>
          <div className="mc-s-sub">{maxExpense ? clip(maxExpense.description) : tr("mc.noExpense")}</div>
        </div>
      </div>
    </div>
  );
}
