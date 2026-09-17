"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { computeBudgetProgress, type TargetMetric } from "@/lib/metrics/targets";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { currencySymbol } from "@/lib/currency";

const METRICS: TargetMetric[] = ["revenue", "expense", "profit"];

interface Props {
  month: string;
  monthLabel: string;
  currency: string;
  dayOfMonth: number;
  daysInMonth: number;
  actuals: Record<TargetMetric, number>;
  targets: Record<TargetMetric, number | null>;
  locale?: Locale;
}

export function BudgetVsActual({ month, monthLabel, currency, dayOfMonth, daysInMonth, actuals, targets, locale = DEFAULT_LOCALE }: Props) {
  const tr = translator(locale);
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vals, setVals] = useState<Record<TargetMetric, string>>({
    revenue: targets.revenue != null ? String(targets.revenue / 100) : "",
    expense: targets.expense != null ? String(targets.expense / 100) : "",
    profit: targets.profit != null ? String(targets.profit / 100) : "",
  });

  const hasAny = METRICS.some((m) => targets[m] != null);

  async function save() {
    setSaving(true);
    try {
      for (const m of METRICS) {
        const raw = vals[m].trim().replace(",", ".");
        const amountCents = raw === "" ? null : Math.round(Number(raw) * 100);
        await fetch("/api/targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, metric: m, amountCents }),
        });
      }
      setEdit(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{tr("budv.title")}</h3>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="muted" style={{ fontSize: 12.5, textTransform: "capitalize" }}>{monthLabel}</span>
          {!edit && (
            <button className="btn btn-line" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => setEdit(true)}>
              {hasAny ? tr("budv.edit") : tr("budv.setGoals")}
            </button>
          )}
        </span>
      </div>

      {edit ? (
        <div>
          <div className="form-row form-row-3">
            {METRICS.map((m) => (
              <div className="field" key={m} style={{ marginBottom: 0 }}>
                <label>{tr("budv.goalLabel", { metric: tr(`budv.metric.${m}`), cur: currency })}</label>
                <input
                  inputMode="decimal"
                  placeholder="—"
                  value={vals[m]}
                  onChange={(e) => setVals((v) => ({ ...v, [m]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn btn-accent" style={{ padding: "8px 16px" }} disabled={saving} onClick={save}>
              {saving ? tr("budv.saving") : tr("common.save")}
            </button>
            <button className="btn btn-line" style={{ padding: "8px 16px" }} disabled={saving} onClick={() => setEdit(false)}>{tr("common.cancel")}</button>
          </div>
        </div>
      ) : !hasAny ? (
        <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>
          {tr("budv.noGoals")}
        </p>
      ) : (
        <div className="brk">
          {METRICS.filter((m) => targets[m] != null).map((m) => {
            const p = computeBudgetProgress(m, targets[m]!, actuals[m], dayOfMonth, daysInMonth);
            const pct = Math.max(0, Math.min(p.pct, 100));
            const good = p.onTrack;
            return (
              <div className="brk-item" key={m}>
                <div className="bl">
                  <b>{tr(`budv.metric.${m}`)}</b>
                  <span>
                    {formatMoney(p.actualCents, currency)} / {formatMoney(p.targetCents, currency)} · {Math.round(p.pct)}%
                    <span className="cat-tag" style={{ marginLeft: 8, background: good ? "var(--accent-soft)" : "var(--warn-soft)", color: good ? "var(--accent-ink)" : "var(--warn)" }}>
                      {good ? tr("budv.inGoal") : m === "expense" ? tr("budv.overspend") : tr("budv.behind")}
                    </span>
                  </span>
                </div>
                <div className="bar"><i style={{ width: `${Math.max(pct, 2)}%`, background: good ? "var(--accent)" : "var(--warn)" }} /></div>
                <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 4 }}>
                  {tr("budv.projection", { amount: formatMoney(p.projectedCents, currency), pct: Math.round(p.projectedPct) })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
