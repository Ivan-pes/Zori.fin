"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BudgetRing } from "@/components/BudgetRing";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { currencySymbol } from "@/lib/currency";
import type { BudgetLine } from "@/lib/metrics/budgets";
import { categoryLabel } from "@/lib/i18n/categories";
import { isSavingsCategory } from "@/lib/categorize/categories";

export function BudgetsView({
  lines,
  month,
  currency = "EUR",
  categories,
  maxCategories = -1,
  suggestions = [],
  locale = DEFAULT_LOCALE,
}: {
  lines: BudgetLine[];
  month: string;
  currency?: string;
  categories: readonly string[];
  maxCategories?: number;
  suggestions?: { category: string; limitCents: number }[];
  locale?: Locale;
}) {
  const tr = translator(locale);
  const router = useRouter();
  const [category, setCategory] = useState(categories[0] ?? "");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const atLimit = maxCategories !== -1 && lines.length >= maxCategories;
  const [applying, setApplying] = useState(false);

  async function applySuggestions() {
    const take = maxCategories === -1 ? suggestions : suggestions.slice(0, maxCategories);
    setApplying(true);
    try {
      for (const sug of take) {
        await fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, category: sug.category, amountCents: sug.limitCents }),
        });
      }
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  const paceText = (p: BudgetLine["pace"]) =>
    p === "over" ? tr("bud.paceOver") : p === "under" ? tr("bud.paceUnder") : tr("bud.paceOntrack");
  const paceColor = (p: BudgetLine["pace"]) =>
    p === "over" ? "var(--danger)" : p === "under" ? "var(--ink-soft)" : "var(--accent-ink)";

  async function add() {
    const euros = parseFloat(limit.replace(",", "."));
    if (!category || !Number.isFinite(euros) || euros < 0) return;
    setBusy(true);
    try {
      await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, category, amountCents: Math.round(euros * 100) }),
      });
      setLimit("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(cat: string) {
    await fetch("/api/budgets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, category: cat }),
    });
    router.refresh();
  }

  return (
    <>
      {lines.length === 0 ? (
        <div className="panel">
          <p style={{ color: "var(--ink-faint)", fontSize: 14, marginBottom: suggestions.length > 0 ? 14 : 0 }}>{tr("bud.empty")}</p>
          {suggestions.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button className="btn btn-accent btn-sm" onClick={applySuggestions} disabled={applying}>
                {applying ? "…" : tr("bud.applyN", { n: maxCategories === -1 ? suggestions.length : Math.min(suggestions.length, maxCategories) })}
              </button>
              <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{tr("bud.suggestHint")}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="grid-3" style={{ gap: 14 }}>
          {lines.map((l) => {
            // Конверт-цель «Накопления»: прогресс к 100% — это хорошо, не перерасход.
            const goal = isSavingsCategory(l.category);
            const done = goal && l.pct >= 100;
            const statusColor = goal ? "var(--accent-ink)" : paceColor(l.pace);
            return (
            <div className="panel bud-ring-card" key={l.category} style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <BudgetRing pct={l.pct} pace={l.pace} goal={goal} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{categoryLabel(l.category, locale)}</b>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
                  {tr(goal ? "bud.savedOf" : "bud.spentOf", { spent: formatMoney(l.spentCents, currency), limit: formatMoney(l.limitCents, currency) })}
                </div>
                {l.plannedCents > 0 && (
                  <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
                    📅 {tr("bud.plannedLine")}: −{formatMoney(l.plannedCents, currency)}
                  </div>
                )}
                <div style={{ fontSize: 12.5, fontWeight: 600, color: statusColor, marginTop: 4 }}>
                  {goal ? (
                    done ? (
                      <>{tr("bud.saveDone")}{l.remainingCents < 0 && ` · +${formatMoney(-l.remainingCents, currency)}`}</>
                    ) : (
                      tr("bud.saveRemaining", { amount: formatMoney(Math.max(l.remainingCents, 0), currency) })
                    )
                  ) : (
                    <>
                      {l.remainingCents >= 0
                        ? tr("bud.remaining", { amount: formatMoney(l.remainingCents, currency) })
                        : tr("bud.over", { amount: formatMoney(-l.remainingCents, currency) })}
                      {" · "}{paceText(l.pace)}
                    </>
                  )}
                </div>
                <button className="btn btn-line btn-sm" style={{ marginTop: 8, color: "var(--danger)" }} onClick={() => remove(l.category)}>{tr("bud.remove")}</button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {atLimit ? (
        <div className="note info" style={{ marginTop: 16, maxWidth: 560 }}>
          <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span>{tr("bud.limitReached", { max: maxCategories })}</span>
        </div>
      ) : (
      <div className="panel" style={{ marginTop: 16, maxWidth: 560 }}>
        <div className="panel-head" style={{ marginBottom: 10 }}><h3>{tr("bud.addTitle")}</h3></div>
        <div className="p-addform bud">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{tr("bud.category")}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{categoryLabel(c, locale)}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{tr("bud.limit", { cur: currencySymbol(currency) })}</label>
            <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="400" />
          </div>
          <button className="btn btn-dark btn-sm" onClick={add} disabled={busy || !limit.trim()}>{tr("bud.add")}</button>
        </div>
      </div>
      )}
    </>
  );
}
