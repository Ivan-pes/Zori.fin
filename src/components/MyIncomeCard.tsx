"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { localeTag, type Locale } from "@/lib/i18n";
import { formatMoneyShort } from "@/lib/format";
import { currencySymbol } from "@/lib/currency";

/** Режимы жизни → процент дохода, который можно тратить. */
export const SPEND_MODES = [
  { key: "save", pct: 50 },
  { key: "norm", pct: 70 },
  { key: "extra", pct: 85 },
] as const;

const L = {
  ru: {
    title: "Мои доходы", salary: "Зарплата", extra: "Доп. доходы", perMonth: "/мес",
    total: "Доход в месяц", modes: "Сколько можно тратить",
    save: "Экономить", norm: "Норма", extra2: "Экстра",
    hint: "Выбери режим — от него считается «можно потратить», остальное уходит в сбережения.",
    empty: "Укажи зарплату — Zori рассчитает, сколько можно тратить в каждом режиме.",
    payday: "День зарплаты", paydayPh: "напр. 5", paydayUnit: "число", paydayNone: "Не выбран", byDefault: "по умолчанию",
  },
  en: {
    title: "My income", salary: "Salary", extra: "Side income", perMonth: "/mo",
    total: "Monthly income", modes: "How much you can spend",
    save: "Save up", norm: "Normal", extra2: "Extra",
    hint: "Pick a mode — “safe to spend” follows it, the rest goes to savings.",
    empty: "Set your salary — Zori computes what you can spend in each mode.",
    payday: "Payday", paydayPh: "e.g. 5", paydayUnit: "day", paydayNone: "Not set", byDefault: "default",
  },
  es: {
    title: "Mis ingresos", salary: "Salario", extra: "Ingresos extra", perMonth: "/mes",
    total: "Ingreso mensual", modes: "Cuánto puedes gastar",
    save: "Ahorrar", norm: "Normal", extra2: "Extra",
    hint: "Elige un modo — «puedes gastar» lo sigue, el resto va al ahorro.",
    empty: "Indica tu salario — Zori calcula cuánto puedes gastar en cada modo.",
    payday: "Día de nómina", paydayPh: "ej. 5", paydayUnit: "día", paydayNone: "Sin definir", byDefault: "por defecto",
  },
  uk: {
    title: "Мої доходи", salary: "Зарплата", extra: "Дод. доходи", perMonth: "/міс",
    total: "Дохід на місяць", modes: "Скільки можна витрачати",
    save: "Економити", norm: "Норма", extra2: "Екстра",
    hint: "Обери режим — від нього рахується «можна витратити», решта йде в заощадження.",
    empty: "Вкажи зарплату — Zori розрахує, скільки можна витрачати в кожному режимі.",
    payday: "День зарплати", paydayPh: "напр. 5", paydayUnit: "число", paydayNone: "Не вказано", byDefault: "за замовч.",
  },
} as const;

export function MyIncomeCard({
  salaryCents,
  extraIncomeCents,
  spendTargetPct,
  paydayDay = null,
  currency,
  locale,
}: {
  salaryCents: number | null;
  extraIncomeCents: number | null;
  spendTargetPct: number | null;
  paydayDay?: number | null;
  currency: string;
  locale: Locale;
}) {
  const t = L[locale] ?? L.ru;
  const tag = localeTag(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [salaryDraft, setSalaryDraft] = useState(salaryCents != null ? String(Math.round(salaryCents / 100)) : "");
  const [extraDraft, setExtraDraft] = useState(extraIncomeCents != null ? String(Math.round(extraIncomeCents / 100)) : "");
  const [paydayDraft, setPaydayDraft] = useState(paydayDay != null ? String(paydayDay) : "");

  const money = (c: number) =>
    formatMoneyShort(c, currency, tag);

  const totalCents = (salaryCents ?? 0) + (extraIncomeCents ?? 0);

  async function save(field: "salaryCents" | "extraIncomeCents", raw: string) {
    const euros = raw.trim() === "" ? null : parseFloat(raw.replace(",", "."));
    if (euros !== null && (!Number.isFinite(euros) || euros < 0)) return;
    setBusy(true);
    try {
      await fetch("/api/my-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: euros === null ? null : Math.round(euros * 100) }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function savePayday(raw: string) {
    const v = raw.trim();
    let day: number | null = null;
    if (v !== "") {
      const n = Math.round(parseFloat(v));
      if (!Number.isFinite(n) || n < 1 || n > 31) return;
      day = n;
    }
    setBusy(true);
    try {
      await fetch("/api/my-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paydayDay: day }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setMode(pct: number) {
    setBusy(true);
    try {
      await fetch("/api/spend-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pct }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const modeLabel = (key: string) => (key === "save" ? t.save : key === "norm" ? t.norm : t.extra2);

  return (
    <div className="panel">
      <div className="panel-head"><h3>{t.title}</h3></div>

      <div className="inc-inputs">
        <label className="inc-field">
          <span>{t.salary}</span>
          <span className="inc-wrap">
            <input
              inputMode="decimal"
              value={salaryDraft}
              placeholder="2500"
              onChange={(e) => setSalaryDraft(e.target.value)}
              onBlur={() => save("salaryCents", salaryDraft)}
              onKeyDown={(e) => e.key === "Enter" && save("salaryCents", salaryDraft)}
              disabled={busy}
            />
            <small>{currencySymbol(currency)}{t.perMonth}</small>
          </span>
        </label>
        <label className="inc-field">
          <span>{t.extra}</span>
          <span className="inc-wrap">
            <input
              inputMode="decimal"
              value={extraDraft}
              placeholder="0"
              onChange={(e) => setExtraDraft(e.target.value)}
              onBlur={() => save("extraIncomeCents", extraDraft)}
              onKeyDown={(e) => e.key === "Enter" && save("extraIncomeCents", extraDraft)}
              disabled={busy}
            />
            <small>{currencySymbol(currency)}{t.perMonth}</small>
          </span>
        </label>
        <label className="inc-field">
          <span>{t.payday}</span>
          <span className="inc-wrap">
            <select
              value={paydayDraft}
              onChange={(e) => { setPaydayDraft(e.target.value); savePayday(e.target.value); }}
              disabled={busy}
              aria-label={t.payday}
            >
              <option value="">{t.paydayNone}</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d} {t.paydayUnit}</option>
              ))}
            </select>
            {/* Пустой суффикс держит селект в одной колонке с полями сумм (у них справа «€/мес») */}
            <small aria-hidden="true" />
          </span>
        </label>
      </div>

      {totalCents > 0 ? (
        <>
          <div className="mm-total" style={{ marginTop: 12 }}>
            <span>{t.total}</span>
            <b>{money(totalCents)}</b>
          </div>

          <div style={{ fontSize: 12, color: "var(--ink-faint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", margin: "14px 0 8px" }}>
            {t.modes}
          </div>
          <div className="inc-modes">
            {SPEND_MODES.map((m) => {
              // Режим не выбран → «Норма» (70%) подсвечена как значение по умолчанию.
              const isDefault = spendTargetPct == null && m.pct === 70;
              const active = spendTargetPct === m.pct || isDefault;
              return (
                <button
                  key={m.key}
                  className={`inc-mode ${active ? "on" : ""}`}
                  onClick={() => setMode(m.pct)}
                  disabled={busy}
                  aria-pressed={active}
                >
                  <span className="im-name">{modeLabel(m.key)}</span>
                  <b className="im-amt">{money(Math.round((totalCents * m.pct) / 100))}</b>
                  <small className="im-pct">{isDefault ? t.byDefault : `${m.pct}% ${active ? "✓" : ""}`}</small>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 10 }}>{t.hint}</p>
        </>
      ) : (
        <p style={{ fontSize: 13, color: "var(--ink-faint)", marginTop: 10 }}>{t.empty}</p>
      )}
    </div>
  );
}
