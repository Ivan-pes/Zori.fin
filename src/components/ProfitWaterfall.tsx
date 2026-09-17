import type { PnL } from "@/types";
import { computeProfitWaterfall } from "@/lib/metrics/waterfall";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * Водопад прибыли месяца (server component, SVG).
 * Цвет по семантике (приход/вычет/итог) + текстовые подписи — не только цвет.
 */
const IN = "#12855F";      // приход (валидированный изумруд)
const OUT = "#B4452E";     // вычеты
const GRID = "var(--line)";

export function ProfitWaterfall({ pnl, locale = DEFAULT_LOCALE }: { pnl: PnL; locale?: Locale }) {
  const tr = translator(locale);
  const steps = computeProfitWaterfall(pnl);
  const cur = pnl.currency;

  const labels: Record<string, string> = {
    revenue: tr("wf.revenue"),
    refunds: tr("wf.refunds"),
    fees: tr("wf.fees"),
    expenses: tr("wf.expenses"),
    profit: tr("wf.profit"),
  };

  if (pnl.revenueCents === 0 && pnl.expenseCents === 0) {
    return <p style={{ color: "var(--ink-faint)", fontSize: 13.5 }}>{tr("wf.empty")}</p>;
  }

  // Геометрия: нормируем уровни [min..max] на высоту графика.
  const W = 560, H = 190, PB = 26, PT = 18;
  const lo = Math.min(0, ...steps.map((s) => Math.min(s.startCents, s.endCents)));
  const hi = Math.max(0, ...steps.map((s) => Math.max(s.startCents, s.endCents)));
  const range = hi - lo || 1;
  const y = (v: number) => PT + ((hi - v) / range) * (H - PT - PB);
  const n = steps.length;
  const slot = W / n;
  const barW = Math.min(72, slot * 0.62);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={tr("wf.title")}>
      {/* нулевая линия */}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={GRID} strokeWidth="1" />
      {steps.map((s, i) => {
        const x = i * slot + (slot - barW) / 2;
        const top = y(Math.max(s.startCents, s.endCents));
        const h = Math.max(2, Math.abs(y(s.startCents) - y(s.endCents)));
        const color = s.kind === "in" ? IN : s.kind === "out" ? OUT : s.endCents >= 0 ? "var(--accent-ink)" : OUT;
        const value = s.kind === "total" ? s.endCents : s.deltaCents;
        const valText = `${value > 0 && s.kind !== "total" ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value), cur)}`;
        return (
          <g key={s.key}>
            {/* соединительная линия уровня к следующей ступени */}
            {i < n - 1 && (
              <line x1={x + barW} x2={(i + 1) * slot + (slot - barW) / 2} y1={y(s.endCents)} y2={y(s.endCents)} stroke={GRID} strokeDasharray="3 3" />
            )}
            <rect x={x} y={top} width={barW} height={h} rx="3" fill={color}>
              <title>{`${labels[s.key]}: ${valText}`}</title>
            </rect>
            <text x={x + barW / 2} y={top - 5} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 600, fill: "var(--ink)" }}>
              {valText}
            </text>
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" style={{ fontSize: 10, fill: "var(--ink-faint)" }}>
              {labels[s.key]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
