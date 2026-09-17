"use client";

import { useState } from "react";
import type { CategorySignal } from "@/lib/metrics/categorySignals";
import type { CategorizationCoverage } from "@/lib/metrics/categorySignals";
import { SignalFeed, STATUS_TONE, TONE_VARS, ACTION_HREF } from "@/components/SignalFeed";
import { localeTag, type Locale } from "@/lib/i18n";
import { formatMoneyShort } from "@/lib/format";
import { categoryLabel } from "@/lib/i18n/categories";

const L = {
  ru: {
    feed: "Требует внимания", allGood: "Все категории в норме 🎉",
    nudge: (n: number, sum: string) => `Уточни ${n} ${plural(n, "транзакцию", "транзакции", "транзакций")} на ${sum} — так сигналы точнее`,
    st: { healthy: "норма", watch: "следить", over: "перерасход", waste: "впустую", new: "новая" },
    committed: "Обязательное", discretionary: "Можно резать", trend: "Тренд 3 мес",
    share: "доля", ofSpend: "трат", budget: "Бюджет", projected: "по темпу", pace: { under: "с запасом", ontrack: "в графике", over: "перерасход" },
    ratioInc: "Доля от дохода", ratioRev: "Доля от выручки", volatility: "Стабильность", topVendor: "Топ-мерчант", newVendors: "новых", waste: "Впустую/мес", runway: "Съедает буфера", days: "дн/мес", season: "Сезонность", vsNorm: "×к норме года",
    stable: "стабильно", rising: "растёт", falling: "падает", empty: "Пока нет данных по категориям за этот месяц.",
  },
  en: {
    feed: "Needs attention", allGood: "All categories are healthy 🎉",
    nudge: (n: number, sum: string) => `Review ${n} transaction${n === 1 ? "" : "s"} (${sum}) — sharper signals`,
    st: { healthy: "healthy", watch: "watch", over: "over", waste: "waste", new: "new" },
    committed: "Committed", discretionary: "Discretionary", trend: "3-mo trend",
    share: "share", ofSpend: "of spend", budget: "Budget", projected: "projected", pace: { under: "under", ontrack: "on track", over: "over" },
    ratioInc: "Of income", ratioRev: "Of revenue", volatility: "Volatility", topVendor: "Top vendor", newVendors: "new", waste: "Waste/mo", runway: "Buffer eaten", days: "d/mo", season: "Seasonality", vsNorm: "×vs year norm",
    stable: "stable", rising: "rising", falling: "falling", empty: "No category data for this month yet.",
  },
  es: {
    feed: "Requiere atención", allGood: "Todas las categorías están sanas 🎉",
    nudge: (n: number, sum: string) => `Revisa ${n} transacci${n === 1 ? "ón" : "ones"} (${sum}) — señales más precisas`,
    st: { healthy: "sana", watch: "vigilar", over: "excede", waste: "desperdicio", new: "nueva" },
    committed: "Fijo", discretionary: "Recortable", trend: "Tendencia 3m",
    share: "cuota", ofSpend: "del gasto", budget: "Presupuesto", projected: "proyectado", pace: { under: "holgado", ontrack: "en curso", over: "excede" },
    ratioInc: "Del ingreso", ratioRev: "De ingresos", volatility: "Volatilidad", topVendor: "Top comercio", newVendors: "nuevos", waste: "Desperdicio/mes", runway: "Consume colchón", days: "d/mes", season: "Estacionalidad", vsNorm: "×vs norma anual",
    stable: "estable", rising: "sube", falling: "baja", empty: "Aún no hay datos de categorías para este mes.",
  },
  uk: {
    feed: "Потребує уваги", allGood: "Всі категорії в нормі 🎉",
    nudge: (n: number, sum: string) => `Уточни ${n} ${plural(n, "транзакцію", "транзакції", "транзакцій")} на ${sum} — так сигнали точніші`,
    st: { healthy: "норма", watch: "стежити", over: "перевитрата", waste: "марно", new: "нова" },
    committed: "Обов'язкове", discretionary: "Можна різати", trend: "Тренд 3 міс",
    share: "частка", ofSpend: "витрат", budget: "Бюджет", projected: "за темпом", pace: { under: "із запасом", ontrack: "у графіку", over: "перевитрата" },
    ratioInc: "Частка від доходу", ratioRev: "Частка від виручки", volatility: "Стабільність", topVendor: "Топ-мерчант", newVendors: "нових", waste: "Марно/міс", runway: "З'їдає буфера", days: "дн/міс", season: "Сезонність", vsNorm: "×до норми року",
    stable: "стабільно", rising: "зростає", falling: "падає", empty: "Поки немає даних за категоріями за цей місяць.",
  },
} as const;

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function CategoriesView({
  signals,
  coverage,
  currency,
  accountType,
  locale,
}: {
  signals: CategorySignal[];
  coverage: CategorizationCoverage;
  currency: string;
  accountType: "business" | "personal";
  locale: Locale;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const t = L[locale] ?? L.ru;
  const tag = localeTag(locale);

  const money = (cents: number) =>
    formatMoneyShort(cents, currency, tag);

  const watch = signals.filter((s) => s.status !== "healthy");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {coverage.uncategorizedCount > 0 && (
        <div className="cat-nudge">
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span>{t.nudge(coverage.uncategorizedCount, money(coverage.uncategorizedCents))}</span>
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>{t.feed}</h3></div>
        <SignalFeed signals={watch} limit={4} emptyText={t.allGood} locale={locale} />
      </div>

      <div className="panel">
        {signals.length === 0 ? (
          <p style={{ color: "var(--ink-faint)", fontSize: 13.5 }}>{t.empty}</p>
        ) : (
          <div className="cat-list">
            {signals.map((s) => (
              <CategoryRow
                key={s.category}
                s={s}
                open={open === s.category}
                onToggle={() => setOpen(open === s.category ? null : s.category)}
                money={money}
                t={t}
                accountType={accountType}
                locale={locale}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Sparkline({ data, tone }: { data: number[]; tone: string }) {
  if (data.length < 2) return <div className="cat-spark" aria-hidden />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 76, h = 26, pad = 3;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="cat-spark" viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden>
      <polyline points={pts.join(" ")} stroke={tone} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type T = (typeof L)[keyof typeof L];

function CategoryRow({
  s, open, onToggle, money, t, accountType, locale,
}: {
  s: CategorySignal; open: boolean; onToggle: () => void;
  money: (c: number) => string; t: T; accountType: "business" | "personal"; locale: Locale;
}) {
  const tone = STATUS_TONE[s.status];
  const { fg, soft } = TONE_VARS[tone];

  // Стрелка тренда: рост расхода — янтарь (внимание), падение — изумруд (хорошо).
  const arrow = s.momPct == null ? null : s.momPct > 1 ? "▲" : s.momPct < -1 ? "▼" : "→";
  const arrowColor = s.momPct == null || Math.abs(s.momPct) <= 1
    ? "var(--ink-faint)"
    : s.momPct > 0 ? "var(--warn)" : "var(--accent-ink)";

  const ratio = accountType === "personal" ? s.incomeRatioPct : s.revenueRatioPct;
  const discShare = s.totalCents > 0 ? Math.round((s.discretionaryCents / s.totalCents) * 100) : 0;

  return (
    <div className={open ? "open" : ""} style={{ borderRadius: 12 }}>
      <button className={`cat-row ${open ? "open" : ""}`} onClick={onToggle} aria-expanded={open}>
        <span className="cat-dot" style={{ background: fg }} />
        <span className="cat-name">
          <b>{categoryLabel(s.category, locale)}</b>
          <span className="cat-badge" style={{ background: soft, color: fg }}>{t.st[s.status]}</span>
        </span>
        <Sparkline data={s.sparkline} tone={fg} />
        <span className="cat-amt">
          <b>{money(s.totalCents)}</b>
          <span className="sh">{s.sharePct}% {t.ofSpend}</span>
        </span>
        <span className="cat-trend" style={{ color: arrowColor }}>
          {arrow}{s.momPct != null && arrow !== "→" ? ` ${Math.abs(Math.round(s.momPct))}%` : ""}
        </span>
      </button>

      {open && (
        <div className="cat-drill">
          <div className="cat-headline">
            <p>{s.headline}</p>
            {s.action && (
              <a className="cat-action" href={ACTION_HREF[s.status]} style={{ textDecoration: "none", display: "inline-block" }}>
                {s.action} →
              </a>
            )}
          </div>

          {(s.committedCents > 0 || s.discretionaryCents > 0) && (
            <div className="cat-metric" style={{ gridColumn: "span 2" }}>
              <div className="k">{t.committed} / {t.discretionary}</div>
              <div className="cat-split">
                <div className="c1" style={{ width: `${100 - discShare}%` }} />
                <div className="c2" style={{ width: `${discShare}%` }} />
              </div>
              <div className="cat-split-lbl">
                <span>{t.committed}: {money(s.committedCents)}</span>
                <span>{t.discretionary}: {money(s.discretionaryCents)}</span>
              </div>
            </div>
          )}

          <div className="cat-metric">
            <div className="k">{t.trend}</div>
            <div className="v">{t[s.trend3m]}{s.momPct != null ? <small> · {s.momPct > 0 ? "+" : ""}{Math.round(s.momPct)}%</small> : null}</div>
          </div>

          {s.budget && (
            <div className="cat-metric">
              <div className="k">{t.budget}</div>
              <div className="v">{money(s.budget.spentCents)} <small>/ {money(s.budget.limitCents)}</small></div>
              <div className="cat-split-lbl"><span>{t.pace[s.budget.pace]}</span><span>{t.projected}: {money(s.budget.projectedCents)}</span></div>
            </div>
          )}

          {ratio != null && (
            <div className="cat-metric">
              <div className="k">{accountType === "personal" ? t.ratioInc : t.ratioRev}</div>
              <div className="v">{ratio}%</div>
            </div>
          )}

          {s.wasteCents != null && s.wasteCents > 0 && (
            <div className="cat-metric">
              <div className="k">{t.waste}</div>
              <div className="v" style={{ color: "var(--danger)" }}>{money(s.wasteCents)}</div>
            </div>
          )}

          {s.vendorTopSharePct != null && s.vendorTopSharePct > 0 && (
            <div className="cat-metric">
              <div className="k">{t.topVendor}</div>
              <div className="v">{s.vendorTopSharePct}%{s.newVendors ? <small> · {s.newVendors} {t.newVendors}</small> : null}</div>
            </div>
          )}

          {s.runwayDaysImpact != null && s.runwayDaysImpact > 0 && (
            <div className="cat-metric">
              <div className="k">{t.runway}</div>
              <div className="v">{s.runwayDaysImpact} {t.days}</div>
            </div>
          )}

          {s.seasonalIndex != null && (
            <div className="cat-metric">
              <div className="k">{t.season}</div>
              <div className="v">{s.seasonalIndex} <small>{t.vsNorm}</small></div>
            </div>
          )}

          {s.volatility != null && (
            <div className="cat-metric">
              <div className="k">{t.volatility}</div>
              <div className="v">{s.volatility === 0 ? "—" : `CV ${s.volatility}`}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
