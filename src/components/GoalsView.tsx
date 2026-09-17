"use client";

import { useState, type CSSProperties } from "react";
import { goalProgress } from "@/lib/metrics/goals";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";
import { currencySymbol } from "@/lib/currency";

interface Goal {
  id: string;
  kind: string;
  title: string;
  target_cents: string;
  current_cents: string;
}

export function GoalsView({
  initialGoals,
  monthlySavingsCents,
  currency = "EUR",
  canEdit,
  locale = DEFAULT_LOCALE,
}: {
  initialGoals: Goal[];
  monthlySavingsCents: number;
  currency?: string;
  canEdit: boolean;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const tag = localeTag(locale);
  const money = (cents: number, cur: string) => `${currencySymbol(cur)}${Math.round(cents / 100).toLocaleString(tag)}`;
  const KINDS = [
    { v: "savings", label: tr("goal.kindSavings") },
    { v: "hire", label: tr("goal.kindHire") },
    { v: "profit", label: tr("goal.kindProfit") },
    { v: "custom", label: tr("goal.kindCustom") },
  ];
  function etaText(p: ReturnType<typeof goalProgress>): string {
    if (p.done) return tr("goal.reached");
    if (p.etaMonths == null) return tr("goal.noPace");
    let label: string;
    if (locale === "ru") label = p.etaLabel ?? "";
    else if (p.etaMonths <= 12) {
      const d = new Date();
      d.setMonth(d.getMonth() + p.etaMonths);
      label = tr("goal.byMonth", { month: d.toLocaleDateString(tag, { month: "long" }) });
    } else label = tr("goal.approxMonths", { n: p.etaMonths });
    return tr("goal.atPace", { label });
  }
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: "savings", title: "", target: "", current: "" });
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    const targetCents = Math.round(parseFloat(form.target.replace(",", ".")) * 100);
    const currentCents = Math.round(parseFloat(form.current.replace(",", ".") || "0") * 100);
    if (!form.title.trim() || !Number.isFinite(targetCents) || targetCents <= 0) {
      setErr(tr("goal.errName"));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: form.kind, title: form.title.trim(), targetCents, currentCents: Math.max(0, currentCents || 0) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error ?? tr("goal.errSave")); return; }
      setGoals((g) => [...g, { id: d.id, kind: form.kind, title: form.title.trim(), target_cents: String(targetCents), current_cents: String(Math.max(0, currentCents || 0)) }]);
      setForm({ kind: "savings", title: "", target: "", current: "" });
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setGoals((g) => g.filter((x) => x.id !== id));
    await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
  }

  return (
    <>
      <div className="goal-grid">
        {goals.map((g) => {
          const target = Number(g.target_cents);
          const current = Number(g.current_cents);
          const p = goalProgress({ targetCents: target, currentCents: current }, monthlySavingsCents);
          return (
            <div className="goal" key={g.id}>
              <div className="ring" style={{ ["--p" as keyof CSSProperties]: p.pct } as CSSProperties}>
                <div className="inner">{p.pct}%</div>
              </div>
              <div className="gmeta">
                <b>{g.title}</b>
                <div className="amt">{money(current, currency)} {tr("goal.of")} {money(target, currency)}</div>
                <div className="eta" style={p.done || p.etaMonths != null ? undefined : { color: "var(--warn)" }}>
                  {etaText(p)}
                </div>
                {canEdit && (
                  <button className="goal-del" onClick={() => void remove(g.id)} title={tr("goal.removeTitle")}>{tr("goal.remove")}</button>
                )}
              </div>
            </div>
          );
        })}

        {canEdit && !adding && (
          <div className="goal add" onClick={() => setAdding(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            {tr("goal.addGoal")}
          </div>
        )}
      </div>

      {adding && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head"><h3>{tr("goal.newGoal")}</h3></div>
          <div className="goal-form">
            <div className="field">
              <label>{tr("goal.fType")}</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
              </select>
            </div>
            <div className="field"><label>{tr("goal.fName")}</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tr("goal.fNamePh")} /></div>
            <div className="field"><label>{tr("goal.fTarget")} ({currencySymbol(currency)})</label><input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} inputMode="decimal" placeholder="3000" /></div>
            <div className="field"><label>{tr("goal.fHave")} ({currencySymbol(currency)})</label><input value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} inputMode="decimal" placeholder="0" /></div>
          </div>
          {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="btn btn-line btn-sm" onClick={() => { setAdding(false); setErr(null); }} disabled={busy}>{tr("common.cancel")}</button>
            <button className="btn btn-dark btn-sm" onClick={() => void save()} disabled={busy}>{busy ? tr("goal.saving") : tr("goal.saveGoal")}</button>
          </div>
        </div>
      )}
    </>
  );
}
