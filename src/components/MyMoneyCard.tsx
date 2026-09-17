"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LiquidAccount } from "@/lib/personal/data";
import { localeTag, type Locale } from "@/lib/i18n";
import { formatMoneyShort } from "@/lib/format";
import { CURRENCIES, currencySymbol } from "@/lib/currency";

type Kind = LiquidAccount["kind"];

const L = {
  ru: {
    title: "Мои деньги", total: "Всего на счетах", add: "Добавить", cancel: "Отмена",
    empty: "Добавь наличку и карты — Zori будет считать сколько можно тратить.",
    name: "Название", amount: "Сумма", save: "Сохранить", saving: "…",
    hint: "Сумма ликвидных счетов = «Остаток на счетах» для аналитики.",
    currency: "Валюта",
    kinds: { cash: "Наличные", card: "Карта", bank: "Банк", savings: "Сбережения" } as Record<Kind, string>,
    ph: { cash: "Наличные", card: "Карта Visa", bank: "Основной счёт", savings: "Подушка" } as Record<Kind, string>,
  },
  en: {
    title: "My money", total: "Total balance", add: "Add", cancel: "Cancel",
    empty: "Add cash and cards — Zori will compute what you can spend.",
    name: "Name", amount: "Amount", save: "Save", saving: "…",
    hint: "Sum of liquid accounts = your balance for analytics.",
    currency: "Currency",
    kinds: { cash: "Cash", card: "Card", bank: "Bank", savings: "Savings" } as Record<Kind, string>,
    ph: { cash: "Cash", card: "Visa card", bank: "Main account", savings: "Rainy day" } as Record<Kind, string>,
  },
  es: {
    title: "Mi dinero", total: "Saldo total", add: "Añadir", cancel: "Cancelar",
    empty: "Añade efectivo y tarjetas — Zori calculará cuánto puedes gastar.",
    name: "Nombre", amount: "Importe", save: "Guardar", saving: "…",
    hint: "Suma de cuentas líquidas = tu saldo para el análisis.",
    currency: "Moneda",
    kinds: { cash: "Efectivo", card: "Tarjeta", bank: "Banco", savings: "Ahorros" } as Record<Kind, string>,
    ph: { cash: "Efectivo", card: "Tarjeta Visa", bank: "Cuenta principal", savings: "Colchón" } as Record<Kind, string>,
  },
  uk: {
    title: "Мої гроші", total: "Всього на рахунках", add: "Додати", cancel: "Скасувати",
    empty: "Додай готівку й картки — Zori рахуватиме, скільки можна витрачати.",
    name: "Назва", amount: "Сума", save: "Зберегти", saving: "…",
    hint: "Сума ліквідних рахунків = «Залишок на рахунках» для аналітики.",
    currency: "Валюта",
    kinds: { cash: "Готівка", card: "Картка", bank: "Банк", savings: "Заощадження" } as Record<Kind, string>,
    ph: { cash: "Готівка", card: "Картка Visa", bank: "Основний рахунок", savings: "Подушка" } as Record<Kind, string>,
  },
} as const;

const KINDS: Kind[] = ["cash", "card", "bank", "savings"];

const KIND_ICON: Record<Kind, string> = {
  cash: "M2 7h20v10H2zM6 12h.01M18 12h.01",
  card: "M2 6h20v12H2zM2 10h20",
  bank: "M4 21V9l8-6 8 6v12M9 21v-6h6v6",
  savings: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M9 11h6",
};

export function MyMoneyCard({
  accounts,
  currency,
  totalBaseCents,
  locale,
}: {
  accounts: LiquidAccount[];
  currency: string;
  /** Сумма всех счетов, уже приведённая к базовой валюте (считается на сервере). */
  totalBaseCents?: number;
  locale: Locale;
}) {
  const t = L[locale] ?? L.ru;
  const tag = localeTag(locale);
  const router = useRouter();

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Kind>("cash");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [curr, setCurr] = useState(currency);
  const [busy, setBusy] = useState(false);

  // Сумма в валюте cur (по умолчанию — базовая валюта пространства).
  const money = (cents: number, cur: string = currency) =>
    formatMoneyShort(cents, cur, tag);

  // Итог: серверная сумма в базе; если её нет (напр. все счета в базе) — сумма как есть.
  const total = totalBaseCents ?? accounts.reduce((s, a) => s + a.balanceCents, 0);

  async function add() {
    const euros = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(euros)) return;
    setBusy(true);
    try {
      await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: name.trim() || t.kinds[kind], balanceCents: Math.round(euros * 100), currency: curr }),
      });
      setName(""); setAmount(""); setCurr(currency); setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch("/api/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{t.title}</h3>
        {!adding && <button className="cat-action" onClick={() => setAdding(true)} disabled={busy}>+ {t.add}</button>}
      </div>

      {accounts.length === 0 && !adding && (
        <p style={{ color: "var(--ink-faint)", fontSize: 13.5, marginBottom: 4 }}>{t.empty}</p>
      )}

      {accounts.length > 0 && (
        <div className="mm-list">
          {accounts.map((a) => (
            <div className="mm-row" key={a.id}>
              <span className="mm-ic">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><path d={KIND_ICON[a.kind]} /></svg>
              </span>
              <span className="mm-name">{a.name}<small>{t.kinds[a.kind]}</small></span>
              <b className="mm-amt">{money(a.balanceCents, a.currency)}</b>
              <button className="mm-del" onClick={() => remove(a.id)} disabled={busy} aria-label="delete">×</button>
            </div>
          ))}
          <div className="mm-total"><span>{t.total}</span><b>{money(total)}</b></div>
        </div>
      )}

      {adding && (
        <div className="mm-form">
          <div className="mm-kinds">
            {KINDS.map((k) => (
              <button key={k} className={`scn-chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{t.kinds[k]}</button>
            ))}
          </div>
          <div className="mm-inputs">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.ph[kind]} />
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.amount} />
            <select value={curr} onChange={(e) => setCurr(e.target.value)} aria-label={t.currency} style={{ flex: "0 0 auto", maxWidth: 110 }}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{currencySymbol(c)} {c}</option>)}
            </select>
          </div>
          <div className="mm-actions">
            <button className="cat-action" onClick={add} disabled={busy || !amount.trim()}>{busy ? t.saving : t.save}</button>
            <button className="scn-help-btn" onClick={() => setAdding(false)} disabled={busy}>{t.cancel}</button>
          </div>
        </div>
      )}

      <p style={{ color: "var(--ink-faint)", fontSize: 12, marginTop: 12 }}>{t.hint}</p>
    </div>
  );
}
