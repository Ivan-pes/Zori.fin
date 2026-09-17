import { sql } from "@/lib/db";
import { computeMrrMovements, type SubInput } from "@/lib/metrics/mrr";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

interface Row {
  amount_cents: string; currency: string | null; interval: string | null;
  interval_count: number; status: string; started_at: Date | null; canceled_at: Date | null; customer_id: string | null;
}

export async function MrrWaterfall({ orgId, locale = DEFAULT_LOCALE }: { orgId: string; locale?: Locale }) {
  const tr = translator(locale);
  const rows = await sql<Row[]>`
    select amount_cents, currency, interval, interval_count, status, started_at, canceled_at, customer_id
    from stripe_subscriptions where org_id = ${orgId}
  `;

  if (rows.length === 0) {
    return (
      <div className="panel">
        <div className="panel-head"><h3>{tr("mrr.title")}</h3></div>
        <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>
          {tr("mrr.empty")}
        </p>
      </div>
    );
  }

  const subs: SubInput[] = rows.map((r) => ({
    amountCents: Number(r.amount_cents),
    interval: r.interval,
    intervalCount: r.interval_count,
    status: r.status,
    startedAt: r.started_at,
    canceledAt: r.canceled_at,
    customerId: r.customer_id,
  }));
  const cur = (rows[0]!.currency ?? "eur").toUpperCase();

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const m = computeMrrMovements(subs, from, to, now);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{tr("mrr.title")}</h3>
        <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{tr("mrr.curMonth")}</span>
      </div>

      <div className="mc-end" style={{ color: "var(--ink)" }}>
        {formatMoney(m.mrrNowCents, cur)}
        <span className="mc-end-l">{tr("mrr.now")}</span>
      </div>

      <div className="mrr-flow">
        <div className="mrr-item"><span className="l">{tr("mrr.new")}</span><span className="v pos">+{formatMoney(m.newMrrCents, cur)}</span><span className="s">{tr("mrr.clients", { n: m.newCustomers })}</span></div>
        <div className="mrr-item"><span className="l">{tr("mrr.churn")}</span><span className="v neg">−{formatMoney(m.churnedMrrCents, cur)}</span><span className="s">{tr("mrr.clients", { n: m.churnedCustomers })}</span></div>
        <div className="mrr-item"><span className="l">{tr("mrr.netNew")}</span><span className="v" style={{ color: m.netNewMrrCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>{m.netNewMrrCents >= 0 ? "+" : "−"}{formatMoney(Math.abs(m.netNewMrrCents), cur)}</span><span className="s">{tr("mrr.newMinusChurn")}</span></div>
        <div className="mrr-item"><span className="l">Quick Ratio</span><span className="v">{m.quickRatio === null ? "∞" : m.quickRatio}</span><span className="s">{tr("mrr.newOverChurn")}</span></div>
        <div className="mrr-item"><span className="l">{tr("mrr.retention")}</span><span className="v" style={{ color: (m.retentionPct ?? 100) >= 90 ? "var(--accent-ink)" : "var(--danger)" }}>{m.retentionPct === null ? "—" : `${m.retentionPct}%`}</span><span className="s">{tr("mrr.cohort")}</span></div>
      </div>

      <div className="cap" style={{ marginTop: 12 }}>{tr("mrr.footnote")}</div>
    </div>
  );
}
