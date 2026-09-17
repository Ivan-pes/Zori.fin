import type { Variance } from "@/lib/metrics/variance";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

function deltaCls(n: number) {
  return n > 0 ? "up" : n < 0 ? "down" : "";
}
function signMoney(cents: number, cur: string) {
  return `${cents >= 0 ? "+" : "−"}${formatMoney(Math.abs(cents), cur)}`;
}

export function VarianceBlock({ variance: v, prevLabel, locale = DEFAULT_LOCALE }: { variance: Variance; prevLabel: string; locale?: Locale }) {
  const tr = translator(locale);
  const drivers = v.drivers.slice(0, 4);
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{tr("var.title")}</h3>
        <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>vs {prevLabel}</span>
      </div>

      <div className="kpi-row" style={{ marginBottom: drivers.length ? 18 : 0 }}>
        <div className="kpi">
          <div className="k-top"><span className="k-lbl">{tr("pnl.revenue")}</span></div>
          <div className={`k-delta ${deltaCls(v.revenueDeltaCents)}`} style={{ fontSize: 18, fontWeight: 600 }}>{signMoney(v.revenueDeltaCents, v.currency)}</div>
        </div>
        <div className="kpi">
          <div className="k-top"><span className="k-lbl">{tr("pnl.profit")}</span></div>
          <div className={`k-delta ${deltaCls(v.profitDeltaCents)}`} style={{ fontSize: 18, fontWeight: 600 }}>{signMoney(v.profitDeltaCents, v.currency)}</div>
        </div>
        <div className="kpi">
          <div className="k-top"><span className="k-lbl">{tr("var.margin")}</span></div>
          <div className={`k-delta ${deltaCls(v.marginDeltaPct)}`} style={{ fontSize: 18, fontWeight: 600 }}>{v.marginDeltaPct >= 0 ? "+" : "−"}{Math.abs(v.marginDeltaPct)} {tr("var.pp")}</div>
        </div>
      </div>

      {drivers.length > 0 && (
        <>
          <div className="cap" style={{ marginBottom: 8 }}>{tr("var.drivers")}</div>
          <div className="brk">
            {drivers.map((d) => (
              <div className="brk-item" key={d.category}>
                <div className="bl"><b>{d.category}</b><span style={{ color: d.deltaCents > 0 ? "var(--danger)" : "var(--accent-ink)" }}>{signMoney(d.deltaCents, v.currency)}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
