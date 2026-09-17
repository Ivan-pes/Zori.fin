"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import type { BudgetLine } from "@/lib/metrics/budgets";
import { categoryLabel } from "@/lib/i18n/categories";
import { currencySymbol } from "@/lib/currency";

/**
 * Распределение плана месяца по конвертам: кольцо (part-to-whole) + редактор.
 * Сегмент рисуется в два слоя: тинт (лимит конверта) и полный цвет
 * (уже использовано: факт + план из календаря) — кольцо «живёт» по мере трат.
 * Категориальная палитра валидирована dataviz-скиллом (CVD/контраст/хрома PASS);
 * идентичность не только цветом: маркеры + подписи в списке (не на сегментах).
 * Хвост 7+ конвертов получает нейтральный серый.
 */
const PALETTE = ["#12855F", "#4270C4", "#B9762B", "#8A56B8", "#B4452E", "#C25A8C"];
const TAIL = "#8A8D96";
const TRACK = "#E2DFD6"; // нераспределённый остаток

const PRESETS = [60, 70, 80];

export function BudgetAllocation({
  month,
  lines,
  currency,
  spendTargetPct,
  monthlyIncomeCents,
  locale = DEFAULT_LOCALE,
}: {
  month: string;
  lines: BudgetLine[];
  currency: string;
  spendTargetPct: number | null;
  monthlyIncomeCents: number;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pctDraft, setPctDraft] = useState<string>(spendTargetPct != null ? String(spendTargetPct) : "");
  // Черновики полей конвертов: category → строка ввода (€ или %)
  const [drafts, setDrafts] = useState<Record<string, { eur?: string; pct?: string }>>({});

  const money = (c: number) => formatMoney(c, currency);
  // Компакт для центра кольца: без копеек, иначе текст не влезает в внутренний круг.
  const moneyC = (c: number) => `${currencySymbol(currency)}${Math.round(c / 100).toLocaleString("ru-RU")}`;

  // База распределения: план месяца (доход × %), иначе — сумма конвертов.
  const targetCents =
    spendTargetPct != null && monthlyIncomeCents > 0
      ? Math.round((monthlyIncomeCents * spendTargetPct) / 100)
      : null;
  const allocated = lines.reduce((s, l) => s + l.limitCents, 0);
  const baseCents = targetCents ?? allocated;
  const unallocCents = Math.max(0, baseCents - allocated);
  const overCents = Math.max(0, allocated - (targetCents ?? allocated));

  // Стабильный порядок (и цвет) — по алфавиту категории.
  const ordered = useMemo(() => [...lines].sort((a, b) => a.category.localeCompare(b.category, "ru")), [lines]);
  const colorOf = (i: number) => (i < PALETTE.length ? PALETTE[i]! : TAIL);

  async function saveTarget(pct: number | null) {
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

  async function saveEnvelope(category: string, amountCents: number) {
    if (!Number.isFinite(amountCents) || amountCents < 0) return;
    setBusy(true);
    try {
      await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, category, amountCents: Math.round(amountCents) }),
      });
      setDrafts((d) => ({ ...d, [category]: {} }));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function commitEur(l: BudgetLine) {
    const raw = drafts[l.category]?.eur;
    if (raw == null || raw === "") return;
    const euros = parseFloat(raw.replace(",", "."));
    if (Number.isFinite(euros)) saveEnvelope(l.category, euros * 100);
  }
  function commitPct(l: BudgetLine) {
    const raw = drafts[l.category]?.pct;
    if (raw == null || raw === "" || !baseCents) return;
    const pct = parseFloat(raw.replace(",", "."));
    if (Number.isFinite(pct) && pct >= 0) saveEnvelope(l.category, (baseCents * pct) / 100);
  }

  // ── Кольцо (SVG): тонкие сегменты, 2px зазоры поверх поверхности ──
  const R = 62;
  const C = 2 * Math.PI * R;
  const GAP = 2.5;
  const segs: { color: string; frac: number; usedRatio: number; label: string; cents: number; usedCents: number }[] =
    ordered.map((l, i) => {
      const usedCents = l.spentCents + l.plannedCents;
      return {
        color: colorOf(i),
        frac: baseCents > 0 ? l.limitCents / baseCents : 0,
        // Доля конверта, которая уже использована (факт + план). Перерасход → сегмент полный.
        usedRatio: l.limitCents > 0 ? Math.min(1, usedCents / l.limitCents) : 0,
        label: categoryLabel(l.category, locale),
        cents: l.limitCents,
        usedCents,
      };
    });
  if (unallocCents > 0 && baseCents > 0) {
    segs.push({ color: TRACK, frac: unallocCents / baseCents, usedRatio: 0, label: tr("alloc.unalloc"), cents: unallocCents, usedCents: 0 });
  }
  const totalUsedCents = lines.reduce((s, l) => s + l.spentCents + l.plannedCents, 0);
  let acc = 0;

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h3>{tr("alloc.title")}</h3>
        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{tr("alloc.subtitle")}</span>
      </div>

      {/* Настройка «тратить не больше N% дохода» */}
      <div className="alloc-target">
        <span style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{tr("alloc.spendTarget")}</span>
        {PRESETS.map((p) => (
          <button
            key={p}
            className={`scn-chip ${spendTargetPct === p ? "on" : ""}`}
            disabled={busy || monthlyIncomeCents === 0}
            onClick={() => saveTarget(p)}
          >
            {p}%
          </button>
        ))}
        <input
          className="alloc-pct-input"
          inputMode="numeric"
          value={pctDraft}
          placeholder="%"
          onChange={(e) => setPctDraft(e.target.value)}
          onBlur={() => {
            const v = parseInt(pctDraft, 10);
            if (Number.isFinite(v) && v >= 10 && v <= 100 && v !== spendTargetPct) saveTarget(v);
          }}
          disabled={busy || monthlyIncomeCents === 0}
        />
        <button className={`scn-chip ${spendTargetPct == null ? "on" : ""}`} disabled={busy} onClick={() => saveTarget(null)}>
          {tr("alloc.auto")}
        </button>
        {monthlyIncomeCents > 0 && (
          <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
            {tr("alloc.ofIncome", { income: money(monthlyIncomeCents) })}
          </span>
        )}
      </div>

      {targetCents == null && (
        <p style={{ fontSize: 13, color: "var(--ink-faint)", margin: "10px 0 4px" }}>{tr("alloc.noTarget")}</p>
      )}

      {overCents > 0 && (
        <div className="cat-nudge" style={{ marginTop: 12 }}>
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
          <span>{tr("alloc.overAlloc", { amount: money(overCents) })}</span>
        </div>
      )}

      {baseCents > 0 && (
        <div className="alloc-grid">
          <div className="alloc-ringwrap">
            <svg viewBox="0 0 160 160" className="alloc-ring" role="img" aria-label={tr("alloc.title")}>
              <circle cx="80" cy="80" r={R} fill="none" stroke={TRACK} strokeWidth="18" opacity="0.35" />
              {segs.map((s, i) => {
                const len = Math.max(0, s.frac * C - GAP);
                const usedLen = len * s.usedRatio;
                const offset = -acc * C;
                acc += s.frac;
                if (len <= 0) return null;
                return (
                  <g key={i}>
                    {/* Тинт — лимит конверта */}
                    <circle
                      cx="80" cy="80" r={R}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="18"
                      strokeLinecap="butt"
                      strokeDasharray={`${len} ${C - len}`}
                      strokeDashoffset={offset - GAP / 2}
                      transform="rotate(-90 80 80)"
                      opacity={s.color === TRACK ? 1 : 0.3}
                    />
                    {/* Полный цвет — использовано (факт + план) */}
                    {usedLen > 0.4 && (
                      <circle
                        cx="80" cy="80" r={R}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="18"
                        strokeLinecap="butt"
                        strokeDasharray={`${usedLen} ${C - usedLen}`}
                        strokeDashoffset={offset - GAP / 2}
                        transform="rotate(-90 80 80)"
                      />
                    )}
                    <title>
                      {s.color === TRACK
                        ? `${s.label}: ${money(s.cents)} (${Math.round(s.frac * 100)}%)`
                        : `${s.label}: ${tr("alloc.usedOf", { used: money(s.usedCents), limit: money(s.cents) })}`}
                    </title>
                  </g>
                );
              })}
              <text x="80" y="76" textAnchor="middle" style={{ fontSize: 15, fontWeight: 700, fill: "var(--ink)" }}>
                {moneyC(totalUsedCents)}
              </text>
              <text x="80" y="93" textAnchor="middle" style={{ fontSize: 8.5, fill: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                {tr("alloc.centerOf", { base: moneyC(baseCents) })}
              </text>
            </svg>
            <div style={{ fontSize: 12, color: "var(--ink-faint)", textAlign: "center" }}>
              {tr("alloc.unalloc")}: <b style={{ color: "var(--ink-soft)" }}>{money(unallocCents)}</b>
            </div>
          </div>

          <div className="alloc-rows">
            {ordered.map((l, i) => {
              const d = drafts[l.category] ?? {};
              const pctVal = baseCents > 0 ? Math.round((l.limitCents / baseCents) * 100) : 0;
              return (
                <div className="alloc-row" key={l.category}>
                  <span className="cat-dot" style={{ background: colorOf(i) }} />
                  <span className="alloc-name">{categoryLabel(l.category, locale)}</span>
                  <span className="alloc-inputs">
                    <input
                      inputMode="numeric"
                      value={d.pct ?? String(pctVal)}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [l.category]: { pct: e.target.value } }))}
                      onBlur={() => commitPct(l)}
                      onKeyDown={(e) => e.key === "Enter" && commitPct(l)}
                      disabled={busy}
                      aria-label={`${l.category}, %`}
                    />
                    <small>%</small>
                    <input
                      inputMode="decimal"
                      value={d.eur ?? String(Math.round(l.limitCents / 100))}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [l.category]: { eur: e.target.value } }))}
                      onBlur={() => commitEur(l)}
                      onKeyDown={(e) => e.key === "Enter" && commitEur(l)}
                      disabled={busy}
                      aria-label={`${l.category}, ${currency}`}
                    />
                    <small>{currencySymbol(currency)}</small>
                  </span>
                </div>
              );
            })}
            <p style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>{tr("alloc.addHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
