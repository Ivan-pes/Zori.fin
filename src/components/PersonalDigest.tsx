import { getPersonalOverview, getBudgetStatus, getSubscriptions } from "@/lib/personal/data";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag, type Locale } from "@/lib/i18n";
import { categoryLabel } from "@/lib/i18n/categories";

export async function PersonalDigest({ orgId, locale }: { orgId: string; locale: Locale }) {
  const tr = translator(locale);
  const tag = localeTag(locale);

  const [ov, subs] = await Promise.all([getPersonalOverview(orgId), getSubscriptions(orgId)]);
  // Дайджест — за последний месяц с данными (а не за пустой текущий).
  const refMonth = ov?.reportMonth ?? new Date();
  const month = refMonth.toLocaleDateString(tag, { month: "long" });
  const ym = `${refMonth.getUTCFullYear()}-${String(refMonth.getUTCMonth() + 1).padStart(2, "0")}`;
  const budgets = await getBudgetStatus(orgId, ym);

  const cur = ov?.currency ?? "EUR";
  const s = ov?.savings;
  const totalSpend = ov?.breakdown.reduce((a, b) => a + b.totalCents, 0) ?? 0;

  return (
    <>
      <div className="panel">
        <div className="rep-summary">
          {s && tr("dig.happened", {
            month,
            income: formatMoney(s.incomeCents, cur),
            spending: formatMoney(s.spendingCents, cur),
            saved: formatMoney(s.savedCents, cur),
            rate: s.ratePct,
          })}
          {subs && subs.summary.count > 0 && (
            <div style={{ marginTop: 8 }}>{tr("dig.subsLine", { count: subs.summary.count, monthly: formatMoney(subs.summary.monthlyCents, cur), stale: subs.summary.staleCount })}</div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>{tr("rep.whereMoney")}</h3><span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{month}</span></div>
          {ov && ov.breakdown.length > 0 ? (
            <div className="brk">
              {ov.breakdown.slice(0, 6).map((b) => {
                const pct = totalSpend > 0 ? Math.round((b.totalCents / totalSpend) * 100) : 0;
                return (
                  <div className="brk-item" key={b.category}>
                    <div className="bl"><b>{categoryLabel(b.category, locale)}</b><span>{formatMoney(b.totalCents, cur)} · {pct}%</span></div>
                    <div className="bar"><i style={{ width: `${Math.max(pct, 2)}%`, background: "var(--accent)" }} /></div>
                  </div>
                );
              })}
            </div>
          ) : <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("rep.loadOrConnect")}</p>}
        </div>

        <div className="panel">
          <div className="panel-head"><h3>{tr("dig.budgets")}</h3></div>
          {budgets.length > 0 ? (
            <div className="brk">
              {budgets.map((l) => (
                <div className="brk-item" key={l.category}>
                  <div className="bl"><b>{categoryLabel(l.category, locale)}</b><span>{formatMoney(l.spentCents, cur)} / {formatMoney(l.limitCents, cur)} · {l.pct}%</span></div>
                  <div className="bar"><i style={{ width: `${Math.min(100, Math.max(l.pct, 2))}%`, background: l.pace === "over" ? "var(--danger)" : "var(--accent)" }} /></div>
                </div>
              ))}
            </div>
          ) : <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("dig.noBudgets")}</p>}
        </div>
      </div>
    </>
  );
}
