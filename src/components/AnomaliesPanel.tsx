import { loadTransactions } from "@/lib/transactions";
import { detectAnomalies } from "@/lib/metrics/anomalies";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";

export async function AnomaliesPanel({ orgId, locale = DEFAULT_LOCALE }: { orgId: string; locale?: Locale }) {
  const tr = translator(locale);
  const tag = localeTag(locale);
  const now = new Date();
  const txns = await loadTransactions(orgId, {
    from: new Date(now.getTime() - 90 * 86_400_000),
    to: new Date(now.getTime() + 86_400_000),
  });
  const flags = detectAnomalies(txns, { t: tr }).slice(0, 8);
  const cur = txns[0]?.currency ?? "EUR";

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{tr("anom.title")}</h3>
        {flags.length > 0 && <span style={{ fontSize: 12.5, color: "var(--warn)" }}>{tr("anom.toCheck", { n: flags.length })}</span>}
      </div>

      {flags.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("anom.none")}</p>
      ) : (
        <table className="tx-table tx-full">
          <tbody>
            {flags.map((f, i) => (
              <tr key={i}>
                <td><span className="tx-ic">⚠</span><span className="tx-name">{f.description}</span></td>
                <td style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>{f.reason}</td>
                <td style={{ color: "var(--ink-faint)", fontSize: 12.5, whiteSpace: "nowrap" }}>{new Date(f.occurredAt).toLocaleDateString(tag, { day: "numeric", month: "short" })}</td>
                <td className="amt neg">−{formatMoney(f.amountCents, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
