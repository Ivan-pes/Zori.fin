import { getCoverage, summarizeCoverage, monthLabel } from "@/lib/metrics/coverage";
import type { Plan } from "@/lib/billing/plan";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";

function tileHref(status: string): string {
  if (status === "income_only") return "/app/integrations";
  if (status === "locked") return "/app/settings";
  return "/app/transactions";
}

export async function MonthCoverage({
  orgId,
  plan,
  monthsBack = 12,
  locale = DEFAULT_LOCALE,
}: {
  orgId: string;
  plan: Plan;
  monthsBack?: number;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const tag = localeTag(locale);
  const shortMonth = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
    return {
      mon: d.toLocaleDateString(tag, { month: "short" }).replace(".", ""),
      isJan: (m ?? 1) === 1,
      yy: String(y).slice(2),
    };
  };
  const STATUS_HINT: Record<string, string> = {
    ok: tr("cov.hintOk"),
    income_only: tr("cov.hintIncomeOnly"),
    empty: tr("cov.hintEmpty"),
    locked: tr("cov.hintLocked"),
  };

  const coverage = await getCoverage(orgId, plan, monthsBack);
  const sum = summarizeCoverage(coverage);
  const chrono = [...coverage].reverse();

  const gaps = sum.incomeOnly.length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{tr("cov.title")}</h3>
        <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
          {tr("cov.covered", { ok: sum.okCount, total: sum.totalVisible })}
          {gaps > 0 ? tr("cov.gapsSuffix", { n: gaps }) : ""}
        </span>
      </div>

      <div className="cov-grid">
        {chrono.map((c) => {
          const { mon, isJan, yy } = shortMonth(c.month);
          return (
            <a
              key={c.month}
              className={`cov-tile cov-${c.status}`}
              href={tileHref(c.status)}
              title={`${monthLabel(c.month, tag)} · ${STATUS_HINT[c.status]}${c.txCount ? ` · ${tr("cov.ops", { n: c.txCount })}` : ""}`}
            >
              <span className="cov-mon">{mon}</span>
              {isJan && <span className="cov-yr">’{yy}</span>}
              {c.status === "locked" && <span className="cov-lock">🔒</span>}
            </a>
          );
        })}
      </div>

      {gaps > 0 && (
        <div className="note warn" style={{ marginTop: 14 }}>
          <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
          <span>
            {tr("cov.gapNote", { months: sum.incomeOnly.map((mm) => monthLabel(mm, tag)).join(", ") })}{" "}
            <a href="/app/integrations" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{tr("cov.uploadLink")}</a>.
          </span>
        </div>
      )}

      <div className="cov-legend">
        <span><i className="cov-ok" />{tr("cov.legOk")}</span>
        <span><i className="cov-income" />{tr("cov.legIncome")}</span>
        <span><i className="cov-empty" />{tr("cov.legEmpty")}</span>
        <span><i className="cov-locked" />{tr("cov.legPlan")}</span>
      </div>
    </div>
  );
}
