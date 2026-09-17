import { sql } from "@/lib/db";
import { getBaseCurrency } from "@/lib/transactions";
import { getRates, convertCents } from "@/lib/fx";
import { computeConcentration, toMonthlyCents, ACTIVE_STATUSES } from "@/lib/metrics/concentration";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

interface SubRow {
  customer_id: string | null;
  amount_cents: string;
  currency: string | null;
  interval: string | null;
  interval_count: number;
  status: string;
}

async function loadConcentration(orgId: string) {
  const rows = await sql<SubRow[]>`
    select customer_id, amount_cents, currency, interval, interval_count, status
    from stripe_subscriptions where org_id = ${orgId}
  `;
  if (rows.length === 0) return null;

  const base = await getBaseCurrency(orgId);
  const rates = await getRates();

  const byCustomer = new Map<string, number>();
  for (const r of rows) {
    if (!ACTIVE_STATUSES.has(r.status)) continue;
    const customer = r.customer_id ?? "—";
    const amountBase = convertCents(Number(r.amount_cents), r.currency ?? "EUR", base, rates);
    byCustomer.set(customer, (byCustomer.get(customer) ?? 0) + toMonthlyCents(amountBase, r.interval, r.interval_count));
  }

  const input = [...byCustomer.entries()].map(([customer, mrrCents]) => ({ customer, mrrCents }));
  return computeConcentration(input, base);
}

export async function ConcentrationPanel({ orgId, locale = DEFAULT_LOCALE }: { orgId: string; locale?: Locale }) {
  const tr = translator(locale);
  const shortCustomer = (id: string): string => {
    if (id === "—") return tr("conc.noId");
    const tail = id.replace(/^cus_/, "");
    return tr("conc.client", { tail: tail.slice(-4) });
  };
  const LEVEL = {
    low: { text: tr("conc.low"), tone: "ok" as const },
    medium: { text: tr("conc.medium"), tone: "info" as const },
    high: { text: tr("conc.high"), tone: "warn" as const },
  };

  const c = await loadConcentration(orgId);
  if (!c) return null;

  const lvl = LEVEL[c.level];
  const top = c.customers[0]!;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{tr("conc.title")}</h3>
        <span className={`cat-tag`} style={{ background: lvl.tone === "warn" ? "var(--warn-soft)" : lvl.tone === "ok" ? "var(--accent-soft)" : "var(--surface-2)", color: lvl.tone === "warn" ? "var(--warn)" : lvl.tone === "ok" ? "var(--accent-ink)" : "var(--ink-soft)" }}>
          {lvl.text}
        </span>
      </div>

      <div className={`note ${lvl.tone}`} style={{ marginBottom: 14 }}>
        <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        <span>
          {tr("conc.bodyA")} <strong>{Math.round(top.sharePct)}%</strong> {tr("conc.bodyB", { mrr: `${formatMoney(top.mrrCents, c.currency)}${tr("conc.perMonth")}` })}
          {" "}{tr("conc.bodyC")} <strong>{Math.round(c.topSharePct)}%</strong> {tr("conc.bodyD", { top3: Math.round(c.top3SharePct) })}
        </span>
      </div>

      <div className="brk">
        {c.customers.map((cust) => (
          <div className="brk-item" key={cust.customer}>
            <div className="bl">
              <b>{shortCustomer(cust.customer)}</b>
              <span>{formatMoney(cust.mrrCents, c.currency)}{tr("conc.perMonth")} · {Math.round(cust.sharePct)}%</span>
            </div>
            <div className="bar"><i style={{ width: `${Math.max(cust.sharePct, 2)}%`, background: c.level === "high" ? "var(--warn)" : "var(--accent)" }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
