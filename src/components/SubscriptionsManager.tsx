"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RecurringExpense } from "@/lib/metrics/recurring";
import { localeTag, type Locale } from "@/lib/i18n";
import { formatMoneyShort } from "@/lib/format";
import { categoryLabel } from "@/lib/i18n/categories";
import { CURRENCIES, currencySymbol } from "@/lib/currency";

const L = {
  ru: {
    add: "Добавить подписку", cancel: "Отмена", save: "Сохранить", saving: "…",
    name: "Название (напр. Netflix)", amount: "Сумма", monthly: "в месяц", weekly: "в неделю",
    cadenceM: "Ежемесячно", cadenceW: "Еженедельно", perMonth: "/мес", noCat: "Без категории", nextDue: "Дата следующего списания",
    manual: "вручную", zombie: (n: number) => `не пользуешься ${n} дн.`,
    del: "Удалить", hideHint: "Удаление авто-подписки скрывает ложное срабатывание.",
    confirmHide: (n: string) => `Скрыть авто-подписку «${n}»? Её можно вернуть ниже.`,
    hiddenTitle: "Скрытые авто-подписки", restore: "Вернуть",
    empty: "Подписок не найдено. Добавь вручную — Zori учтёт их в тратах и календаре.",
    bizAdd: "Добавить платёж", bizName: "Напр. Зарплата — Иван, Аренда офиса, Сантехник",
    bizEmpty: "Платежей пока нет. Добавь зарплаты, аренду, закупки — Zori учтёт их в прогнозе, календаре и бюджетах.",
    bizHint: "Регулярные платежи попадают в прогноз остатка, календарь и резервируют бюджеты-конверты своей категории.",
  },
  en: {
    add: "Add subscription", cancel: "Cancel", save: "Save", saving: "…",
    name: "Name (e.g. Netflix)", amount: "Amount", monthly: "monthly", weekly: "weekly",
    cadenceM: "Monthly", cadenceW: "Weekly", perMonth: "/mo", noCat: "No category", nextDue: "Next charge date",
    manual: "manual", zombie: (n: number) => `unused ${n}d`,
    del: "Delete", hideHint: "Deleting an auto subscription hides a false positive.",
    confirmHide: (n: string) => `Hide auto subscription “${n}”? You can restore it below.`,
    hiddenTitle: "Hidden auto subscriptions", restore: "Restore",
    empty: "No subscriptions found. Add manually — Zori counts them in spend and calendar.",
    bizAdd: "Add payment", bizName: "E.g. Salary — Ivan, Office rent, Plumber",
    bizEmpty: "No payments yet. Add salaries, rent, purchases — Zori counts them in forecast, calendar and budgets.",
    bizHint: "Recurring payments feed the balance forecast, calendar and reserve budget envelopes of their category.",
  },
  es: {
    add: "Añadir suscripción", cancel: "Cancelar", save: "Guardar", saving: "…",
    name: "Nombre (ej. Netflix)", amount: "Importe", monthly: "mensual", weekly: "semanal",
    cadenceM: "Mensual", cadenceW: "Semanal", perMonth: "/mes", noCat: "Sin categoría", nextDue: "Próximo cargo",
    manual: "manual", zombie: (n: number) => `sin usar ${n}d`,
    del: "Eliminar", hideHint: "Eliminar una auto-suscripción oculta un falso positivo.",
    confirmHide: (n: string) => `¿Ocultar la auto-suscripción «${n}»? Puedes restaurarla abajo.`,
    hiddenTitle: "Auto-suscripciones ocultas", restore: "Restaurar",
    empty: "No hay suscripciones. Añade manualmente — Zori las cuenta en gasto y calendario.",
    bizAdd: "Añadir pago", bizName: "Ej. Salario — Iván, Alquiler, Fontanero",
    bizEmpty: "Sin pagos aún. Añade salarios, alquiler, compras — Zori los cuenta en pronóstico, calendario y presupuestos.",
    bizHint: "Los pagos recurrentes alimentan el pronóstico, el calendario y reservan los sobres de su categoría.",
  },
  uk: {
    add: "Додати підписку", cancel: "Скасувати", save: "Зберегти", saving: "…",
    name: "Назва (напр. Netflix)", amount: "Сума", monthly: "на місяць", weekly: "на тиждень",
    cadenceM: "Щомісяця", cadenceW: "Щотижня", perMonth: "/міс", noCat: "Без категорії", nextDue: "Дата наступного списання",
    manual: "вручну", zombie: (n: number) => `не користуєшся ${n} дн.`,
    del: "Видалити", hideHint: "Видалення авто-підписки приховує хибне спрацювання.",
    confirmHide: (n: string) => `Приховати авто-підписку «${n}»? Її можна повернути нижче.`,
    hiddenTitle: "Приховані авто-підписки", restore: "Повернути",
    empty: "Підписок не знайдено. Додай вручну — Zori врахує їх у витратах і календарі.",
    bizAdd: "Додати платіж", bizName: "Напр. Зарплата — Іван, Оренда офісу, Сантехнік",
    bizEmpty: "Платежів поки немає. Додай зарплати, оренду, закупівлі — Zori врахує їх у прогнозі, календарі та бюджетах.",
    bizHint: "Регулярні платежі потрапляють у прогноз залишку, календар і резервують бюджети-конверти своєї категорії.",
  },
} as const;

export function SubscriptionsManager({
  items,
  currency,
  locale,
  categories = [],
  variant = "personal",
  hidden = [],
}: {
  items: RecurringExpense[];
  currency: string;
  locale: Locale;
  /** Категории орги — платёж привязывается к бюджету-конверту. */
  categories?: string[];
  variant?: "personal" | "business";
  /** Ключи скрытых авто-подписок — показываем с кнопкой «вернуть». */
  hidden?: string[];
}) {
  const t = L[locale] ?? L.ru;
  const biz = variant === "business";
  const tag = localeTag(locale);
  const router = useRouter();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly">("monthly");
  const [cat, setCat] = useState("");
  const [due, setDue] = useState("");
  const [curr, setCurr] = useState(currency);
  const [busy, setBusy] = useState(false);

  const money = (cents: number) =>
    formatMoneyShort(cents, currency, tag);

  async function add() {
    const euros = parseFloat(amount.replace(",", "."));
    if (!name.trim() || !Number.isFinite(euros) || euros <= 0) return;
    setBusy(true);
    try {
      await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          amountCents: Math.round(euros * 100),
          cadence,
          currency: curr,
          category: cat || null,
          nextDue: due || undefined,
        }),
      });
      setName(""); setAmount(""); setCat(""); setDue(""); setCurr(currency); setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: RecurringExpense) {
    // Скрытие авто-подписки убирает её из подписок, обзора и календаря — спросим.
    if (!r.manual && typeof window !== "undefined" && !window.confirm(t.confirmHide(r.merchant))) return;
    setBusy(true);
    try {
      const body = r.manual ? { manualId: r.manualId } : { matchKey: r.matchKey };
      await fetch("/api/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function restore(matchKey: string) {
    setBusy(true);
    try {
      await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchKey }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // «claude ai» → «Claude Ai» для человекочитаемого ярлыка скрытого ключа.
  const prettyKey = (k: string) => k.replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15 }} />
        {!adding && <button className="cat-action" onClick={() => setAdding(true)} disabled={busy}>+ {biz ? t.bizAdd : t.add}</button>}
      </div>

      {adding && (
        <div className="sub-addform">
          <div className="mm-kinds">
            <button className={`scn-chip ${cadence === "monthly" ? "on" : ""}`} onClick={() => setCadence("monthly")}>{t.cadenceM}</button>
            <button className={`scn-chip ${cadence === "weekly" ? "on" : ""}`} onClick={() => setCadence("weekly")}>{t.cadenceW}</button>
          </div>
          <input className="saf-in" value={name} onChange={(e) => setName(e.target.value)} placeholder={biz ? t.bizName : t.name} />
          <div className="saf-row">
            <input className="saf-in" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.amount} />
            <select className="saf-in" value={curr} onChange={(e) => setCurr(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{currencySymbol(c)} {c}</option>)}
            </select>
          </div>
          {categories.length > 0 && (
            <select className="saf-in" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">{t.noCat}</option>
              {categories.map((c) => <option key={c} value={c}>{categoryLabel(c, locale)}</option>)}
            </select>
          )}
          <input className="saf-in" type="date" value={due} onChange={(e) => setDue(e.target.value)} title={t.nextDue} />
          <div className="mm-actions">
            <button className="cat-action" onClick={add} disabled={busy || !name.trim() || !amount.trim()}>{busy ? t.saving : t.save}</button>
            <button className="scn-help-btn" onClick={() => setAdding(false)} disabled={busy}>{t.cancel}</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{biz ? t.bizEmpty : t.empty}</p>
      ) : (
        <div className="sub-list">
          {items.map((r, i) => (
            <div className="sub-row" key={r.manual ? `m-${r.manualId}` : `a-${r.matchKey}-${i}`}>
              <div className="sub-main">
                <div className="sub-name">{r.merchant}</div>
                <div className="sub-chips">
                  {r.category && <span className="cat-tag">{categoryLabel(r.category, locale)}</span>}
                  {r.manual && <span className="cat-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{t.manual}</span>}
                  {r.stale && <span className="cat-tag" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>{t.zombie(r.daysSinceLast)}</span>}
                </div>
              </div>
              <div className="sub-amt amt neg">
                −{money(r.monthlyEstimateCents)}<span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{t.perMonth}</span>
              </div>
              <button className="mm-del" onClick={() => remove(r)} disabled={busy} aria-label={t.del} title={t.del}>×</button>
            </div>
          ))}
        </div>
      )}

      {hidden.length > 0 && (
        <div className="sub-hidden">
          <div className="sub-hidden-title">{t.hiddenTitle}</div>
          <div className="sub-hidden-chips">
            {hidden.map((k) => (
              <button key={k} className="sub-restore" onClick={() => void restore(k)} disabled={busy} title={t.restore}>
                <span>{prettyKey(k)}</span>
                <span className="sub-restore-ic" aria-hidden>↩</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p style={{ color: "var(--ink-faint)", fontSize: 12, marginTop: 12 }}>{biz ? t.bizHint : t.hideHint}</p>
    </>
  );
}
