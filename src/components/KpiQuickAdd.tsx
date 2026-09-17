"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { localeTag, type Locale } from "@/lib/i18n";
import { currencySymbol } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/i18n/categories";

type Kind = "income" | "expense" | "savings" | "balance";

/**
 * Разворачиваемая сводка карточки: клик по значению раскрывает компактную
 * расшифровку прямо под цифрой (доход → зарплата+доп; траты → топ-категории;
 * отложено → доход−траты; остаток → счета+буфер). Данные готовит сервер.
 */
export type KpiDetail =
  | { kind: "income"; items: { description: string | null; category: string | null; totalCents: number }[]; totalCents: number; ratePct: number | null }
  | { kind: "expense"; items: { category: string; totalCents: number }[]; totalCents: number; plannedAheadCents: number }
  | { kind: "savings"; incomeCents: number; spendingCents: number; savedCents: number; ratePct: number | null }
  | { kind: "balance"; accounts: { id: string; name: string; balanceCents: number; currency: string }[]; bufferCents: number; totalBaseCents: number };

const L = {
  ru: {
    add: "Добавить", save: "Сохранить", cancel: "Отмена", saving: "…",
    amount: "Сумма", date: "Дата", cat: "Категория", descIncome: "Напр. Зарплата",
    descExpense: "Напр. Продукты", descSavings: "Напр. На отпуск",
    titles: { income: "Добавить доход", expense: "Добавить трату", savings: "Отложить в накопления" } as Record<Exclude<Kind, "balance">, string>,
    more: "Подробнее", less: "Свернуть",
    salary: "Зарплата", extra: "Доп. доход", auto: "Считается автоматически по операциям",
    rate: "Норма накоплений", income: "Доход", spending: "Траты", saved: "Отложено",
    buffer: "Буфер", total: "Всего на счетах", planned: "запланировано впереди",
    noAcc: "Счета пока не добавлены", noSpend: "Трат за месяц пока нет",
    noIncome: "Поступлений за месяц пока нет",
  },
  en: {
    add: "Add", save: "Save", cancel: "Cancel", saving: "…",
    amount: "Amount", date: "Date", cat: "Category", descIncome: "E.g. Salary",
    descExpense: "E.g. Groceries", descSavings: "E.g. Vacation fund",
    titles: { income: "Add income", expense: "Add expense", savings: "Put into savings" } as Record<Exclude<Kind, "balance">, string>,
    more: "Details", less: "Collapse",
    salary: "Salary", extra: "Side income", auto: "Detected automatically from transactions",
    rate: "Savings rate", income: "Income", spending: "Spending", saved: "Saved",
    buffer: "Buffer", total: "Total balance", planned: "planned ahead",
    noAcc: "No accounts yet", noSpend: "No spending this month yet",
    noIncome: "No income this month yet",
  },
  es: {
    add: "Añadir", save: "Guardar", cancel: "Cancelar", saving: "…",
    amount: "Importe", date: "Fecha", cat: "Categoría", descIncome: "Ej. Salario",
    descExpense: "Ej. Compra", descSavings: "Ej. Vacaciones",
    titles: { income: "Añadir ingreso", expense: "Añadir gasto", savings: "Apartar al ahorro" } as Record<Exclude<Kind, "balance">, string>,
    more: "Detalles", less: "Ocultar",
    salary: "Salario", extra: "Ingresos extra", auto: "Detectado automáticamente de las operaciones",
    rate: "Tasa de ahorro", income: "Ingreso", spending: "Gasto", saved: "Ahorrado",
    buffer: "Colchón", total: "Saldo total", planned: "planeado por delante",
    noAcc: "Aún sin cuentas", noSpend: "Sin gastos este mes todavía",
    noIncome: "Sin ingresos este mes todavía",
  },
  uk: {
    add: "Додати", save: "Зберегти", cancel: "Скасувати", saving: "…",
    amount: "Сума", date: "Дата", cat: "Категорія", descIncome: "Напр. Зарплата",
    descExpense: "Напр. Продукти", descSavings: "Напр. На відпустку",
    titles: { income: "Додати дохід", expense: "Додати витрату", savings: "Відкласти в заощадження" } as Record<Exclude<Kind, "balance">, string>,
    more: "Докладніше", less: "Згорнути",
    salary: "Зарплата", extra: "Дод. дохід", auto: "Визначається автоматично з операцій",
    rate: "Норма заощаджень", income: "Дохід", spending: "Витрати", saved: "Відкладено",
    buffer: "Буфер", total: "Всього на рахунках", planned: "заплановано попереду",
    noAcc: "Рахунків ще немає", noSpend: "Витрат за місяць поки немає",
    noIncome: "Надходжень за місяць поки немає",
  },
} as const;

const SAVINGS_CATEGORY = "Накопления/Перевод";
const SHADES = ["var(--accent)", "#3E9C7C", "#6BB89E", "var(--warn)", "#C9C4B6"];

/**
 * KPI-карточка личного обзора: «+» раскрывает быстрый ввод (сумма · дата ·
 * категория → POST /api/transactions), а клик по цифре — компактную сводку
 * (detail). Форма и сводка взаимно исключают друг друга.
 */
export function KpiQuickAdd({
  kind,
  label,
  valueCents,
  currency,
  locale,
  categories = [],
  deltaNode = null,
  valueColor,
  detail,
}: {
  kind: Kind;
  label: string;
  valueCents: number;
  currency: string;
  locale: Locale;
  categories?: string[];
  deltaNode?: React.ReactNode;
  valueColor?: string;
  detail?: KpiDetail;
}) {
  const t = L[locale] ?? L.ru;
  const tag = localeTag(locale);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState(false);

  const canAdd = kind !== "balance";
  const money = formatMoney(valueCents, currency, tag);

  async function save() {
    const euros = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(euros) || euros <= 0) return;
    setBusy(true);
    try {
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: kind === "income" ? "income" : "expense",
          amountCents: Math.round(euros * 100),
          description: desc.trim() || undefined,
          // «Отложено» — перевод в накопления: заполняет конверт-цель,
          // но не считается тратой в аналитике.
          category: kind === "savings" ? SAVINGS_CATEGORY : kind === "expense" && cat ? cat : undefined,
          dateIso: date,
        }),
      });
      setAmount(""); setDesc(""); setCat(""); setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const ph = kind === "income" ? t.descIncome : kind === "savings" ? t.descSavings : t.descExpense;

  const m = (c: number, cur: string = currency) => formatMoney(c, cur, tag);

  function renderDetail(dt: KpiDetail) {
    if (dt.kind === "income") {
      if (dt.items.length === 0) return <div className="kd-note">{t.noIncome}</div>;
      return (
        <>
          <div className="brk">
            {dt.items.map((it, i) => {
              const label = it.description || (it.category ? categoryLabel(it.category, locale) : t.income);
              const pct = dt.totalCents > 0 ? Math.round((it.totalCents / dt.totalCents) * 100) : 0;
              return (
                <div className="brk-item" key={`${label}-${i}`}>
                  <div className="bl"><b>{label}</b><span>{m(it.totalCents)} · {pct}%</span></div>
                  <div className="bar"><i style={{ width: `${Math.max(pct, 2)}%`, background: SHADES[i] ?? "#C9C4B6" }} /></div>
                </div>
              );
            })}
          </div>
          {dt.ratePct != null && <div className="kd-row kd-strong"><span>{t.rate}</span><b>{dt.ratePct}%</b></div>}
        </>
      );
    }
    if (dt.kind === "expense") {
      if (dt.items.length === 0) return <div className="kd-note">{t.noSpend}</div>;
      return (
        <>
          <div className="brk">
            {dt.items.map((it, i) => {
              const pct = dt.totalCents > 0 ? Math.round((it.totalCents / dt.totalCents) * 100) : 0;
              return (
                <div className="brk-item" key={it.category}>
                  <div className="bl"><b>{categoryLabel(it.category, locale)}</b><span>{m(it.totalCents)} · {pct}%</span></div>
                  <div className="bar"><i style={{ width: `${Math.max(pct, 2)}%`, background: SHADES[i] ?? "#C9C4B6" }} /></div>
                </div>
              );
            })}
          </div>
          {dt.plannedAheadCents > 0 && (
            <div className="kd-note kd-warn">+{m(dt.plannedAheadCents)} {t.planned}</div>
          )}
        </>
      );
    }
    if (dt.kind === "savings") {
      return (
        <>
          <div className="kd-row"><span>{t.income}</span><b>{m(dt.incomeCents)}</b></div>
          <div className="kd-row"><span>− {t.spending}</span><b>{m(dt.spendingCents)}</b></div>
          <div className="kd-row kd-strong"><span>{t.saved}</span><b>{m(dt.savedCents)}</b></div>
          {dt.ratePct != null && <div className="kd-row"><span>{t.rate}</span><b>{dt.ratePct}%</b></div>}
        </>
      );
    }
    return (
      <>
        {dt.accounts.length > 0
          ? dt.accounts.map((a) => (
              <div className="kd-row" key={a.id}><span>{a.name}</span><b>{m(a.balanceCents, a.currency)}</b></div>
            ))
          : <div className="kd-note">{t.noAcc}</div>}
        {dt.bufferCents > 0 && <div className="kd-row"><span>{t.buffer}</span><b>−{m(dt.bufferCents)}</b></div>}
        {dt.accounts.length > 0 && <div className="kd-row kd-strong"><span>{t.total}</span><b>{m(dt.totalBaseCents)}</b></div>}
      </>
    );
  }

  return (
    <div className="kpi kpi-q">
      <div className="k-top">
        <span className="k-lbl">{label}</span>
        {canAdd && (
          <button
            className="kpi-add"
            onClick={() => { setExpanded(false); setOpen((o) => !o); }}
            disabled={busy}
            aria-expanded={open}
            title={t.titles[kind as Exclude<Kind, "balance">]}
          >
            {open ? "×" : "+"}
          </button>
        )}
      </div>

      {detail ? (
        <button
          type="button"
          className="kpi-open"
          onClick={() => { setOpen(false); setExpanded((e) => !e); }}
          aria-expanded={expanded}
          title={expanded ? t.less : t.more}
        >
          <span className="k-val" style={valueColor ? { color: valueColor } : undefined}>{money}</span>
          <svg className={`kpi-chev ${expanded ? "open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      ) : (
        <div className="k-val" style={valueColor ? { color: valueColor } : undefined}>{money}</div>
      )}
      {deltaNode}

      {open && (
        <div className="kpi-form">
          <input
            inputMode="decimal"
            autoFocus
            placeholder={`${t.amount}, ${currencySymbol(currency)}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title={t.date} />
          {kind === "expense" && categories.length > 0 && (
            <select value={cat} onChange={(e) => setCat(e.target.value)} title={t.cat}>
              <option value="">{t.cat}…</option>
              {categories.map((c) => <option key={c} value={c}>{categoryLabel(c, locale)}</option>)}
            </select>
          )}
          <input placeholder={ph} value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="cat-action" onClick={save} disabled={busy || !amount.trim()}>{busy ? t.saving : t.save}</button>
            <button className="scn-help-btn" onClick={() => setOpen(false)} disabled={busy}>{t.cancel}</button>
          </div>
        </div>
      )}

      {expanded && detail && <div className="kpi-detail">{renderDetail(detail)}</div>}
    </div>
  );
}
