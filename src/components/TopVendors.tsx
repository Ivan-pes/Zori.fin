import type { VendorSpend } from "@/lib/metrics/vendors";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export function TopVendors({ vendors, currency, prevLabel, locale = DEFAULT_LOCALE }: { vendors: VendorSpend[]; currency: string; prevLabel: string; locale?: Locale }) {
  const tr = translator(locale);
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{tr("vnd.title")}</h3>
        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{tr("vnd.sub")}</span>
      </div>
      {vendors.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("vnd.empty")}</p>
      ) : (
        <div className="brk">
          {vendors.map((v) => {
            const up = v.deltaPct !== null && v.deltaPct > 0;
            return (
              <div className="brk-item" key={v.vendor}>
                <div className="bl">
                  <b>
                    {v.vendor}
                    {v.isNew && <span className="cat-tag" style={{ marginLeft: 8, background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{tr("vnd.new")}</span>}
                  </b>
                  <span>
                    {formatMoney(v.totalCents, currency)} · {Math.round(v.sharePct)}%
                    {v.deltaPct !== null && (
                      <span style={{ marginLeft: 8, fontWeight: 600, color: up ? "var(--danger)" : "var(--accent-ink)" }}>
                        {up ? "▲" : "▼"} {Math.abs(v.deltaPct).toFixed(0)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="bar"><i style={{ width: `${Math.max(v.sharePct, 2)}%`, background: "var(--ink-soft)" }} /></div>
              </div>
            );
          })}
          <p style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2 }}>{tr("vnd.deltaNote", { label: prevLabel })}</p>
        </div>
      )}
    </div>
  );
}
