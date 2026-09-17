"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MonthCalendar, CalItem } from "@/lib/metrics/calendar";
import type { PlannedOccurrence } from "@/lib/metrics/planned";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { categoryLabel } from "@/lib/i18n/categories";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";
import { currencySymbol } from "@/lib/currency";

interface DayTxn { description: string | null; amountCents: number; dir: "in" | "out"; category: string | null }
interface DayBill { label: string; amountCents: number; matchKey?: string; manualId?: string }

function compact(cents: number, currency: string, tag: string): string {
  const s = currencySymbol(currency);
  const v = Math.round(cents / 100).toLocaleString(tag);
  return `${s}${v}`;
}

function chip(it: CalItem, currency: string, tag: string) {
  const sign = it.dir === "in" ? "+" : "−";
  const cls = it.dir === "in" ? "in" : it.dir === "bill" ? "bill" : it.dir === "forecast" ? "fc" : "out";
  const showLabel = it.dir !== "in";
  return (
    <span className={`ev ${cls}`} key={`${it.dir}-${it.label}-${it.amountCents}`}>
      {sign}{compact(it.amountCents, currency, tag)}{showLabel ? <span className="lbl"> {it.label}</span> : null}
    </span>
  );
}

export function CashflowCalendar({
  cal,
  currency = "EUR",
  dayTxns = {},
  plannedByDay = {},
  billsByDay = {},
  locale = DEFAULT_LOCALE,
  categories = [],
}: {
  cal: MonthCalendar;
  currency?: string;
  dayTxns?: Record<number, DayTxn[]>;
  plannedByDay?: Record<number, PlannedOccurrence[]>;
  /** Предстоящие списания подписок по дням — показываем в деталях дня. */
  billsByDay?: Record<number, DayBill[]>;
  locale?: Locale;
  /** Категории трат — плановая трата сразу попадает в свой бюджет-конверт. */
  categories?: string[];
}) {
  const tr = translator(locale);
  const tag = localeTag(locale);
  const router = useRouter();
  const DOW = tr("cal.dow").split(",");
  const [selected, setSelected] = useState<number | null>(null);
  const monthName = new Date(Date.UTC(cal.year, cal.month, 1)).toLocaleDateString(tag, { month: "long" });
  const list = selected !== null ? dayTxns[selected] ?? [] : [];
  const plannedList = selected !== null ? plannedByDay[selected] ?? [] : [];
  const billsList = selected !== null ? billsByDay[selected] ?? [] : [];
  const dayIn = list.filter((t) => t.dir === "in").reduce((s, t) => s + t.amountCents, 0);
  const dayOut = list.filter((t) => t.dir === "out").reduce((s, t) => s + t.amountCents, 0);

  const dayIso = (d: number) => `${cal.year}-${String(cal.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Форма добавления: «факт» (реальная операция) или «план» (будущее).
  const todayIso = new Date().toISOString().slice(0, 10);
  const selIso = selected !== null ? dayIso(selected) : null;
  const isPastOrToday = selIso !== null && selIso <= todayIso;

  const [plLabel, setPlLabel] = useState("");
  const [plAmount, setPlAmount] = useState("");
  const [plDir, setPlDir] = useState<"expense" | "income">("expense");
  const [plKind, setPlKind] = useState<"once" | "monthly">("once");
  const [plCat, setPlCat] = useState("");
  const [entry, setEntry] = useState<"fact" | "plan">("fact");
  const [busy, setBusy] = useState(false);
  // Прошлое/сегодня по умолчанию — факт (влияет на все цифры), будущее — план.
  const effEntry: "fact" | "plan" = isPastOrToday ? entry : "plan";

  async function addPlanned() {
    const euros = parseFloat(plAmount.replace(",", "."));
    if (selected === null || !plLabel.trim() || !Number.isFinite(euros) || euros <= 0) return;
    setBusy(true);
    try {
      if (effEntry === "fact") {
        // Реальная операция задним числом → графики, конверты, сигналы.
        await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction: plDir,
            amountCents: Math.round(euros * 100),
            description: plLabel.trim(),
            category: plDir === "expense" && plCat ? plCat : undefined,
            dateIso: dayIso(selected),
          }),
        });
      } else {
        await fetch("/api/planned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: plLabel.trim(),
            amountCents: Math.round(euros * 100),
            direction: plDir,
            kind: plKind,
            startDay: dayIso(selected),
            // категория связывает плановую трату с бюджетом-конвертом
            category: plDir === "expense" && plCat ? plCat : null,
          }),
        });
      }
      setPlLabel(""); setPlAmount(""); setPlCat("");
      router.refresh();
    } finally { setBusy(false); }
  }

  async function removePlanned(id: string) {
    await fetch("/api/planned", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    router.refresh();
  }

  // Убрать подписку прямо из календаря: ручную — удаляем, авто — скрываем (с подтверждением).
  async function removeBill(b: DayBill) {
    if (!b.manualId && typeof window !== "undefined" && !window.confirm(tr("cal.billHideConfirm", { name: b.label }))) return;
    setBusy(true);
    try {
      await fetch("/api/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b.manualId ? { manualId: b.manualId } : { matchKey: b.matchKey }),
      });
      router.refresh();
    } finally { setBusy(false); }
  }

  async function cancelFrom(id: string, day: number) {
    await fetch("/api/planned", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, endDay: dayIso(day) }) });
    router.refresh();
  }

  return (
    <div className="panel">
      <div className="cal">
        {DOW.map((d) => (
          <div className="dow" key={d}>{d}</div>
        ))}
        {Array.from({ length: cal.leadingBlanks }).map((_, i) => (
          <div className="day dim" key={`b${i}`} />
        ))}
        {cal.days.map((day) => {
          const cls = ["day", "clickable"];
          if (day.isToday) cls.push("today");
          if (day.gap) cls.push("gap");
          const planned = plannedByDay[day.day] ?? [];
          return (
            <div className={cls.join(" ")} key={day.day} onClick={() => setSelected(day.day)} role="button">
              <span className="dn">
                {day.day}
                {day.isToday && <em className="dn-today"> · {tr("cal.today")}</em>}
              </span>
              {day.items.slice(0, 2).map((it) => chip(it, currency, tag))}
              {planned.slice(0, 1).map((p, i) => (
                <span className="ev pl" key={`p${i}`}>{p.direction === "income" ? "+" : "−"}{compact(p.amountCents, currency, tag)}<span className="lbl"> {p.label}</span></span>
              ))}
              {(day.items.length > 0 || planned.length > 0) && (
                <div className="cal-dots">
                  {day.items.slice(0, 3).map((it, i) => (
                    <i key={i} className={`dot ${it.dir === "in" ? "in" : it.dir === "bill" ? "bill" : "out"}`} />
                  ))}
                  {planned.length > 0 && <i className="dot pl" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        <span><i style={{ background: "var(--accent)" }} />{tr("cal.legendIn")}</span>
        <span><i style={{ background: "var(--ink-faint)" }} />{tr("cal.legendOut")}</span>
        <span><i style={{ background: "var(--warn)" }} />{tr("cal.legendBill")}</span>
        <span><i style={{ background: "var(--danger-soft)", border: "1px solid var(--danger)" }} />{tr("cal.legendGap")}</span>
        <span><i style={{ background: "transparent", border: "1.5px solid var(--accent)" }} />{tr("cal.legendPlanned")}</span>
      </div>

      {selected !== null && (
        <div className="cal-modal-bg" onClick={() => setSelected(null)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal-head">
              <div>
                <b>{selected} {monthName}</b>
                <div className="cm-sum">
                  {dayIn > 0 && <span style={{ color: "var(--accent-ink)" }}>↑ {formatMoney(dayIn, currency)}</span>}
                  {dayOut > 0 && <span style={{ color: "var(--danger)" }}>↓ {formatMoney(dayOut, currency)}</span>}
                </div>
              </div>
              <button className="cm-close" onClick={() => setSelected(null)} aria-label={tr("cal.close")}>✕</button>
            </div>
            <div className="cal-modal-body">
              {list.length === 0 && plannedList.length === 0 && billsList.length === 0 && (
                <p style={{ color: "var(--ink-faint)", fontSize: 13.5, marginBottom: 4 }}>{tr("cal.noDayOps")}</p>
              )}
              {list.map((t, i) => (
                <div className="cm-row" key={`t${i}`}>
                  <div className="cm-info">
                    <b>{t.description ?? tr("cal.noName")}</b>
                    {t.category && <span className="cm-cat">{categoryLabel(t.category, locale)}</span>}
                  </div>
                  <span className="cm-amt" style={{ color: t.dir === "in" ? "var(--accent-ink)" : "var(--ink)" }}>
                    {t.dir === "in" ? "+" : "−"}{formatMoney(t.amountCents, currency)}
                  </span>
                </div>
              ))}

              {billsList.length > 0 && (
                <>
                  <div className="rep-section" style={{ margin: "12px 0 6px" }}>{tr("cal.billsTitle")}</div>
                  {billsList.map((b, i) => (
                    <div className="cm-row" key={`b${i}`}>
                      <div className="cm-info">
                        <b>{b.label}</b>
                        <span className="cm-cat">{b.manualId ? tr("cal.billManual") : tr("cal.billAuto")}</span>
                      </div>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="cm-amt" style={{ color: "var(--ink-soft)" }}>≈ −{formatMoney(b.amountCents, currency)}</span>
                        <button className="btn btn-line btn-sm" style={{ color: "var(--danger)" }} onClick={() => void removeBill(b)} disabled={busy}>{tr("cal.plRemove")}</button>
                      </span>
                    </div>
                  ))}
                </>
              )}

              {plannedList.length > 0 && (
                <>
                  <div className="rep-section" style={{ margin: "12px 0 6px" }}>{tr("cal.planned")}</div>
                  {plannedList.map((p, i) => (
                    <div className="cm-row" key={`p${i}`}>
                      <div className="cm-info">
                        <b>{p.label}</b>
                        <span className="cm-cat">{p.kind === "monthly" ? tr("cal.plMonthly") : tr("cal.plOnce")}</span>
                        {p.category && <span className="cm-cat">{categoryLabel(p.category, locale)}</span>}
                      </div>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="cm-amt" style={{ color: p.direction === "income" ? "var(--accent-ink)" : "var(--ink)" }}>{p.direction === "income" ? "+" : "−"}{formatMoney(p.amountCents, currency)}</span>
                        {p.kind === "monthly" && <button className="btn btn-line btn-sm" onClick={() => cancelFrom(p.planId, selected)} title={tr("cal.plCancelFrom")}>✕мес</button>}
                        <button className="btn btn-line btn-sm" style={{ color: "var(--danger)" }} onClick={() => removePlanned(p.planId)}>{tr("cal.plRemove")}</button>
                      </span>
                    </div>
                  ))}
                </>
              )}

              <div className="rep-section" style={{ margin: "14px 0 8px" }}>{effEntry === "fact" ? tr("cal.addFact") : tr("cal.addPlanned")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {isPastOrToday && (
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    <button className={`scn-chip ${effEntry === "fact" ? "on" : ""}`} onClick={() => setEntry("fact")}>{tr("cal.entryFact")}</button>
                    <button className={`scn-chip ${effEntry === "plan" ? "on" : ""}`} onClick={() => setEntry("plan")}>{tr("cal.entryPlan")}</button>
                    <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>{effEntry === "fact" ? tr("cal.factHint") : ""}</span>
                  </div>
                )}
                <input placeholder={tr("cal.plLabel")} value={plLabel} onChange={(e) => setPlLabel(e.target.value)} style={{ width: "100%", border: "1px solid var(--line-2)", borderRadius: 8, padding: "8px 10px", fontSize: 14 }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input inputMode="decimal" placeholder={tr("cal.plAmount")} value={plAmount} onChange={(e) => setPlAmount(e.target.value)} style={{ flex: 1, minWidth: 90, border: "1px solid var(--line-2)", borderRadius: 8, padding: "8px 10px", fontSize: 14 }} />
                  <select value={plDir} onChange={(e) => setPlDir(e.target.value as "expense" | "income")}>
                    <option value="expense">{tr("cal.plExpense")}</option>
                    <option value="income">{tr("cal.plIncome")}</option>
                  </select>
                  {effEntry === "plan" && (
                    <select value={plKind} onChange={(e) => setPlKind(e.target.value as "once" | "monthly")}>
                      <option value="once">{tr("cal.plOnce")}</option>
                      <option value="monthly">{tr("cal.plMonthly")}</option>
                    </select>
                  )}
                  {plDir === "expense" && categories.length > 0 && (
                    <select value={plCat} onChange={(e) => setPlCat(e.target.value)} style={{ maxWidth: 180 }}>
                      <option value="">{tr("cal.plNoCat")}</option>
                      {categories.map((c) => <option key={c} value={c}>{categoryLabel(c, locale)}</option>)}
                    </select>
                  )}
                </div>
                <button className="btn btn-dark btn-sm" onClick={addPlanned} disabled={busy || !plLabel.trim() || !plAmount.trim()} style={{ alignSelf: "flex-start" }}>{tr("cal.plAdd")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
