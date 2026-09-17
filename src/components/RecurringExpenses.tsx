import { loadTransactions } from "@/lib/transactions";
import { detectRecurring, recurringMonthlyTotal, findDuplicateCharges } from "@/lib/metrics/recurring";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";

export async function RecurringExpenses({ orgId, locale = DEFAULT_LOCALE }: { orgId: string; locale?: Locale }) {
  const tr = translator(locale);
  const tag = localeTag(locale);
  const now = new Date();
  const txns = await loadTransactions(orgId, {
    from: new Date(now.getTime() - 120 * 86_400_000),
    to: new Date(now.getTime() + 86_400_000),
  });
  const items = detectRecurring(txns).slice(0, 10);
  const duplicates = findDuplicateCharges(txns).slice(0, 5);
  const cur = txns[0]?.currency ?? "EUR";
  const monthlyTotal = recurringMonthlyTotal(items);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{tr("rec.title")}</h3>
        {items.length > 0 && (
          <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
            ≈ {formatMoney(monthlyTotal, cur)}{tr("rec.perMonth")}
          </span>
        )}
      </div>

      {duplicates.length > 0 && (
        <div className="note warn" style={{ marginBottom: 14 }}>
          <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
          <span>
            <strong>{tr("rec.dupTitle")}</strong>{" "}
            {duplicates.map((d, i) => (
              <span key={d.merchant + d.dates.join()}>
                {i > 0 && "; "}
                {d.merchant} — {tr("rec.dupItem", { count: d.count, amount: formatMoney(d.amountCents, cur) })} ({d.dates.map((x) => new Date(x).toLocaleDateString(tag, { day: "numeric", month: "short" })).join(", ")})
              </span>
            ))}
            {tr("rec.dupTail")}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>
          {tr("rec.empty")}
        </p>
      ) : (
        <table className="tx-table tx-full">
          <thead>
            <tr>
              <th>{tr("rec.merchant")}</th>
              <th>{tr("rec.cadence")}</th>
              <th>{tr("rec.last")}</th>
              <th style={{ textAlign: "right" }}>{tr("rec.perMonthCol")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.merchant + r.lastChargeAt}>
                <td>
                  <span className="tx-name">{r.merchant}</span>
                  {r.stale && <span className="cat-tag" style={{ marginLeft: 8, background: "var(--warn-soft)", color: "var(--warn)" }} title={tr("rec.staleTitle", { n: r.daysSinceLast })}>{tr("rec.check")}</span>}
                </td>
                <td style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                  {r.cadence === "weekly" ? tr("rec.weekly") : tr("rec.monthly")} · {r.count}×
                </td>
                <td style={{ color: "var(--ink-soft)", fontSize: 13, whiteSpace: "nowrap" }}>
                  {new Date(r.lastChargeAt).toLocaleDateString(tag, { day: "numeric", month: "short" })}
                </td>
                <td className="amt neg">−{formatMoney(r.monthlyEstimateCents, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
