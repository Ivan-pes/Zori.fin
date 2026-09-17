import { loadTransactions } from "@/lib/transactions";
import { computePnL, expensesByCategory } from "@/lib/metrics/engine";
import { getBenchmarks, positionVsBenchmark, toneFor, type Industry } from "@/lib/metrics/benchmarks";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

const TONE_COLOR = { ok: "var(--accent)", warn: "var(--danger)", info: "var(--ink-soft)" } as const;

export async function BenchmarksPanel({ orgId, industry: industryRaw, locale = DEFAULT_LOCALE }: { orgId: string; industry?: string | null; locale?: Locale }) {
  const tr = translator(locale);
  const industry: Industry = (["saas", "ecommerce", "agency", "freelance"].includes(industryRaw ?? "") ? industryRaw : "saas") as Industry;
  const now = new Date();
  const txns = await loadTransactions(orgId, {
    from: new Date(now.getTime() - 90 * 86_400_000),
    to: new Date(now.getTime() + 86_400_000),
  });
  const pnl = computePnL(txns);
  const cats = expensesByCategory(txns);
  const totalExp = cats.reduce((s, c) => s + c.totalCents, 0);
  const marketing = cats
    .filter((c) => /маркет|реклам/i.test(c.category))
    .reduce((s, c) => s + c.totalCents, 0);

  const values: Record<string, number> = {
    netMargin: Math.round(pnl.marginPct * 10) / 10,
    marketingShare: totalExp > 0 ? Math.round((marketing / totalExp) * 1000) / 10 : 0,
  };

  const benchmarks = getBenchmarks(industry);
  const hasData = txns.length > 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{tr("bm.title")}</h3>
        <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{tr(`bm.ind.${industry}`)} · {tr("bm.days90")}</span>
      </div>

      {!hasData ? (
        <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("bm.noData")}</p>
      ) : (
        <div className="bm-list">
          {benchmarks.map((b) => {
            const v = values[b.metric] ?? 0;
            const pos = positionVsBenchmark(v, b);
            const tone = toneFor(b.metric, pos);
            const scaleMax = Math.max(b.p75 * 1.25, v * 1.1, 1);
            const pct = (x: number) => `${Math.min(100, (x / scaleMax) * 100)}%`;
            const verdict = pos === "around" ? tr("bm.around") : pos === "above" ? tr("bm.above") : tr("bm.below");
            return (
              <div className="bm-row" key={b.metric}>
                <div className="bm-top">
                  <b>{tr(`bm.metric.${b.metric}`)}</b>
                  <span style={{ color: TONE_COLOR[tone], fontWeight: 600 }}>{v}{b.unit} · {verdict}</span>
                </div>
                <div className="bm-bar">

                  <i className="bm-range" style={{ left: pct(b.p25), width: `calc(${pct(b.p75)} - ${pct(b.p25)})` }} />

                  <i className="bm-med" style={{ left: pct(b.p50) }} />

                  <i className="bm-val" style={{ left: pct(v), background: TONE_COLOR[tone] }} />
                </div>
                <div className="bm-scale">
                  <span>p25 {b.p25}{b.unit}</span>
                  <span>{tr("bm.median")} {b.p50}{b.unit}</span>
                  <span>p75 {b.p75}{b.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="cap" style={{ marginTop: 12 }}>{tr("bm.footnote")}</div>
    </div>
  );
}
