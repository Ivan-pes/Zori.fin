"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { categoryLabel } from "@/lib/i18n/categories";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";

interface Txn {
  id: string;
  source: string;
  kind: string;
  direction: "income" | "expense";
  grossCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  origCurrency?: string;
  origGrossCents?: number;
  occurredAt: string;
  description: string | null;
  category: string | null;
  memberId?: string | null;
}
interface Totals {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  feeCents: number;
  count: number;
}

type TypeF = "all" | "income" | "expense";
type SourceF = "all" | "stripe" | "manual" | "paypal" | "gocardless" | "csv";
type PeriodF = "month" | "30" | "90" | "all";
type SortBy = "date" | "amount";
type SortDir = "asc" | "desc";

const LIMIT = 25;

interface HouseholdMember { id: string; label: string }

// Локальные строки формы ручной операции (по образцу MyMoneyCard).
const ADD_L = {
  ru: {
    add: "Добавить операцию", expense: "Трата", income: "Доход", save: "Сохранить", cancel: "Отмена",
    desc: "Описание (напр. Продукты в Lidl)", amount: "Сумма", autoCat: "Категория: автоматически",
    del: "Удалить операцию", delConfirm: "Удалить эту операцию?", learned: "Запомнил — так буду категоризовать этого продавца",
    recat: "Пересчитать категории", recatDone: (n: number) => `Обновлено категорий: ${n}`,
    recatTitle: "Прогнать улучшенные правила по всем операциям (ручные правки не трогаем)",
  },
  en: {
    add: "Add operation", expense: "Expense", income: "Income", save: "Save", cancel: "Cancel",
    desc: "Description (e.g. Groceries at Lidl)", amount: "Amount", autoCat: "Category: automatic",
    del: "Delete operation", delConfirm: "Delete this operation?", learned: "Learned — this merchant will be categorized like this",
    recat: "Recompute categories", recatDone: (n: number) => `Categories updated: ${n}`,
    recatTitle: "Re-run improved rules over all operations (manual edits untouched)",
  },
  es: {
    add: "Añadir operación", expense: "Gasto", income: "Ingreso", save: "Guardar", cancel: "Cancelar",
    desc: "Descripción (ej. Compra en Lidl)", amount: "Importe", autoCat: "Categoría: automática",
    del: "Eliminar operación", delConfirm: "¿Eliminar esta operación?", learned: "Aprendido — este comercio se categorizará así",
    recat: "Recalcular categorías", recatDone: (n: number) => `Categorías actualizadas: ${n}`,
    recatTitle: "Reaplicar reglas mejoradas a todas las operaciones (ediciones manuales intactas)",
  },
  uk: {
    add: "Додати операцію", expense: "Витрата", income: "Дохід", save: "Зберегти", cancel: "Скасувати",
    desc: "Опис (напр. Продукти в Lidl)", amount: "Сума", autoCat: "Категорія: автоматично",
    del: "Видалити операцію", delConfirm: "Видалити цю операцію?", learned: "Запам'ятав — так категоризуватиму цього продавця",
    recat: "Перерахувати категорії", recatDone: (n: number) => `Оновлено категорій: ${n}`,
    recatTitle: "Прогнати покращені правила по всіх операціях (ручні правки не чіпаємо)",
  },
} as const;

export function TransactionsView({
  locale = DEFAULT_LOCALE,
  household = false,
  members = [],
  categories = [],
}: {
  locale?: Locale;
  household?: boolean;
  members?: HouseholdMember[];
  /** Таксоном категорий (личный/бизнес) — включает форму добавления и правку категорий. */
  categories?: string[];
}) {
  const tr = translator(locale);
  const tag = localeTag(locale);
  const PERIODS: { v: PeriodF; l: string }[] = [
    { v: "month", l: tr("tx.thisMonth") },
    { v: "30", l: `30 ${tr("tx.daysWord")}` },
    { v: "90", l: `90 ${tr("tx.daysWord")}` },
    { v: "all", l: tr("tx.allTime") },
  ];
  const SOURCES: { v: SourceF; l: string }[] = [
    { v: "all", l: tr("tx.allSources") },
    { v: "stripe", l: "Stripe" },
    { v: "gocardless", l: tr("tx.bank") },
    { v: "csv", l: tr("tx.csv") },
    { v: "manual", l: tr("tx.manualSrc") },
    { v: "paypal", l: "PayPal" },
  ];
  const TYPES: [TypeF, string][] = [
    ["all", tr("tx.all")],
    ["income", tr("tx.income")],
    ["expense", tr("tx.expense")],
  ];
  const sourceLabel = (s: string) =>
    s === "stripe" ? "Stripe" : s === "paypal" ? "PayPal" : s === "manual" ? tr("tx.manualOne") : s === "gocardless" ? tr("tx.bank") : s === "csv" ? tr("tx.statement") : s;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "short" });

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState<TypeF>("all");
  const [source, setSource] = useState<SourceF>("all");
  const [period, setPeriod] = useState<PeriodF>("month");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [reloadKey, setReloadKey] = useState(0);

  const [rows, setRows] = useState<Txn[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [base, setBase] = useState("EUR");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  function buildQuery(offset: number) {
    const p = new URLSearchParams({ period, sortBy, sortDir, limit: String(LIMIT), offset: String(offset) });
    if (debounced) p.set("search", debounced);
    if (type !== "all") p.set("type", type);
    if (source !== "all") p.set("source", source);
    return p.toString();
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/transactions?${buildQuery(0)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((d) => {
        if (cancelled) return;
        setRows(d.rows);
        setTotals(d.totals);
        if (d.base) setBase(d.base);
        setHasMore(d.hasMore);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, type, source, period, sortBy, sortDir, reloadKey]);

  async function attribute(id: string, memberId: string | null) {
    setRows((prev) => prev.map((t) => (t.id === id ? { ...t, memberId } : t)));
    await fetch("/api/transactions/attribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, memberId }),
    }).catch(() => {});
  }

  // ── Ручные операции + правка категории ────────────────────────
  const al = ADD_L[locale] ?? ADD_L.ru;
  const [adding, setAdding] = useState(false);
  const [fDir, setFDir] = useState<"expense" | "income">("expense");
  const [fAmount, setFAmount] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fCat, setFCat] = useState("");
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [learnedFor, setLearnedFor] = useState<string | null>(null);

  async function addOperation() {
    const euros = parseFloat(fAmount.replace(",", "."));
    if (!Number.isFinite(euros) || euros <= 0) return;
    setBusy(true);
    try {
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: fDir,
          amountCents: Math.round(euros * 100),
          description: fDesc.trim() || undefined,
          category: fDir === "expense" && fCat ? fCat : undefined,
          dateIso: fDate,
        }),
      });
      setFAmount(""); setFDesc(""); setFCat(""); setAdding(false);
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  async function removeOperation(id: string) {
    if (!window.confirm(al.delConfirm)) return;
    setBusy(true);
    try {
      await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  const [recatMsg, setRecatMsg] = useState<string | null>(null);
  /** Пересчёт категорий улучшенными правилами (без AI); user-правки не трогаются. */
  async function recategorizeAll() {
    setBusy(true);
    try {
      const r = await fetch("/api/transactions/recategorize", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      setRecatMsg(al.recatDone(d.changed ?? 0));
      setTimeout(() => setRecatMsg(null), 4000);
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  /** Смена категории траты: сохраняет + учит систему на этом мерчанте (§4.3). */
  async function recategorize(id: string, category: string) {
    setRows((prev) => prev.map((t) => (t.id === id ? { ...t, category } : t)));
    try {
      const r = await fetch("/api/transactions/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, category }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.learned) {
        setLearnedFor(id);
        setTimeout(() => setLearnedFor(null), 2500);
      }
    } catch {}
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/transactions?${buildQuery(rows.length)}`);
      const d = await r.json();
      setRows((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...d.rows.filter((t: Txn) => !seen.has(t.id))];
      });
      setHasMore(d.hasMore);
    } catch {
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleSort(col: SortBy) {
    if (sortBy === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  }
  const sortArrow = (col: SortBy) => (sortBy === col ? (sortDir === "desc" ? " ↓" : " ↑") : "");

  return (
    <>
      <div className="filters">
        <div className="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input placeholder={tr("tx.searchPh")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {TYPES.map(([v, l]) => (
          <button key={v} className={`fchip ${type === v ? "on" : ""}`} onClick={() => setType(v)}>{l}</button>
        ))}
        <select className="fchip fchip-sel" value={period} onChange={(e) => setPeriod(e.target.value as PeriodF)}>
          {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
        <select className="fchip fchip-sel" value={source} onChange={(e) => setSource(e.target.value as SourceF)}>
          {SOURCES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        {categories.length > 0 && !adding && (
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
            {recatMsg && <span className="cat-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{recatMsg}</span>}
            <button className="scn-chip" onClick={recategorizeAll} disabled={busy} title={al.recatTitle}>↻ {al.recat}</button>
            <button className="cat-action" onClick={() => setAdding(true)} disabled={busy}>+ {al.add}</button>
          </span>
        )}
      </div>

      {adding && (
        <div className="panel" style={{ marginBottom: 14, padding: 18 }}>
          <div className="mm-form">
            <div className="mm-kinds">
              <button className={`scn-chip ${fDir === "expense" ? "on" : ""}`} onClick={() => setFDir("expense")}>− {al.expense}</button>
              <button className={`scn-chip ${fDir === "income" ? "on" : ""}`} onClick={() => setFDir("income")}>+ {al.income}</button>
            </div>
            <div className="mm-inputs" style={{ flexWrap: "wrap" }}>
              <input inputMode="decimal" style={{ maxWidth: 140 }} value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder={`${al.amount}, ${base}`} />
              <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder={al.desc} />
              {fDir === "expense" && (
                <select className="fchip fchip-sel" value={fCat} onChange={(e) => setFCat(e.target.value)}>
                  <option value="">{al.autoCat}</option>
                  {categories.map((c) => <option key={c} value={c}>{categoryLabel(c, locale)}</option>)}
                </select>
              )}
              <input type="date" style={{ maxWidth: 160 }} value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div className="mm-actions">
              <button className="cat-action" onClick={addOperation} disabled={busy || !fAmount.trim()}>{al.save}</button>
              <button className="scn-help-btn" onClick={() => setAdding(false)} disabled={busy}>{al.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {totals && !error && !loading && (
        <div className="summary-bar">
          <div className="s"><span>{tr("tx.opsCount")}:</span> <b>{totals.count}</b></div>
          <div className="s"><span>{tr("tx.income")}:</span> <b style={{ color: "var(--accent-ink)" }}>+{formatMoney(totals.incomeCents, base)}</b></div>
          <div className="s"><span>{tr("tx.expense")}:</span> <b>−{formatMoney(totals.expenseCents, base)}</b></div>
          <div className="s"><span>{tr("tx.fees")}:</span> <b style={{ color: "var(--warn)" }}>{formatMoney(totals.feeCents, base)}</b></div>
          <div className="s" style={{ marginLeft: "auto" }}><span>{tr("tx.net")}:</span> <b>{totals.netCents >= 0 ? "+" : "−"}{formatMoney(Math.abs(totals.netCents), base)}</b></div>
        </div>
      )}

      <div className="panel">

      {error ? (
        <div className="tx-state">
          {tr("tx.loadFail")}{" "}
          <button className="tx-retry" onClick={() => setReloadKey((k) => k + 1)}>{tr("tx.retry")}</button>
        </div>
      ) : loading ? (
        <div className="tx-state">{tr("tx.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="tx-state">{tr("tx.notFound")}</div>
      ) : (
        <>
          <div className="tx-scroll">
          <table className="tx-table tx-full">
            <thead>
              <tr>
                <th className="tx-sortable" onClick={() => toggleSort("date")}>{tr("tx.date")}{sortArrow("date")}</th>
                <th>{tr("ov.thDesc")}</th>
                <th>{tr("ov.thCat")}</th>
                <th>{tr("tx.thSource")}</th>
                {household && <th>{tr("who.title")}</th>}
                <th style={{ textAlign: "right" }}>{tr("tx.thFee")}</th>
                <th className="tx-sortable" style={{ textAlign: "right" }} onClick={() => toggleSort("amount")}>{tr("ov.thAmount")}{sortArrow("amount")}</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const income = t.direction === "income";
                return (
                  <tr key={t.id}>
                    <td style={{ color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{fmtDate(t.occurredAt)}</td>
                    <td><span className="tx-ic">{income ? "↑" : "↓"}</span><span className="tx-name">{t.description ?? tr("ov.noDesc")}</span></td>
                    <td>
                      {income ? (
                        <span className="cat-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{tr("ov.revenueTag")}</span>
                      ) : categories.length > 0 ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <select
                            className="tx-cell"
                            value={t.category ?? ""}
                            onChange={(e) => e.target.value && recategorize(t.id, e.target.value)}
                            title={al.learned}
                          >
                            {!t.category && <option value="">{tr("ov.other")}…</option>}
                            {t.category && !categories.includes(t.category) && <option value={t.category}>{categoryLabel(t.category, locale)}</option>}
                            {categories.map((c) => <option key={c} value={c}>{categoryLabel(c, locale)}</option>)}
                          </select>
                          {learnedFor === t.id && <span className="cat-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>✓</span>}
                        </span>
                      ) : (
                        <span className="cat-tag">{t.category ?? tr("ov.other")}</span>
                      )}
                    </td>
                    <td style={{ color: "var(--ink-soft)", fontSize: 13 }}>{sourceLabel(t.source)}</td>
                    {household && (
                      <td>
                        <select
                          className="tx-cell"
                          value={t.memberId ?? ""}
                          onChange={(e) => attribute(t.id, e.target.value || null)}
                        >
                          <option value="">{tr("who.shared")}</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="amt" style={{ color: "var(--ink-faint)", fontWeight: 500 }}>{t.feeCents > 0 ? formatMoney(t.feeCents, t.currency) : "—"}</td>
                    <td className={`amt ${income ? "pos" : "neg"}`}>
                      {t.origCurrency && <span className="fx-orig" title={tr("tx.original", { amount: formatMoney(t.origGrossCents ?? 0, t.origCurrency) })}>≈ </span>}
                      {income ? "+" : "−"}{formatMoney(t.grossCents, t.currency)}
                    </td>
                    <td style={{ width: 30, textAlign: "right" }}>
                      {(t.source === "manual" || t.source === "csv") && (
                        <button className="mm-del" onClick={() => removeOperation(t.id)} disabled={busy} aria-label={al.del} title={al.del}>×</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {hasMore && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="btn btn-line" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? tr("tx.loading") : tr("tx.showMore")}
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </>
  );
}
