import type { CategorySignal, CategoryStatus } from "@/lib/metrics/categorySignals";
import { categoryLabel } from "@/lib/i18n/categories";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export type Tone = "emerald" | "amber" | "red" | "gray";

export const STATUS_TONE: Record<CategoryStatus, Tone> = {
  healthy: "emerald",
  watch: "amber",
  over: "amber",
  waste: "red",
  new: "gray",
};

export const TONE_VARS: Record<Tone, { fg: string; soft: string }> = {
  emerald: { fg: "var(--accent)", soft: "var(--accent-soft)" },
  amber: { fg: "var(--warn)", soft: "var(--warn-soft)" },
  red: { fg: "var(--danger)", soft: "var(--danger-soft)" },
  gray: { fg: "var(--ink-faint)", soft: "var(--surface-2)" },
};

/** Куда ведёт предложенное действие сигнала. */
export const ACTION_HREF: Record<CategoryStatus, string> = {
  waste: "/app/subscriptions",   // «Отменить неиспользуемое» — управление платежами
  over: "/app/budgets",          // «Поднять лимит или урезать» — конверты
  watch: "/app/budgets",         // «Установить лимит»
  new: "/app/transactions",      // «Проверить категорию»
  healthy: "/app/categories",
};

const WARN_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);
const NEW_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/**
 * Сигнальная лента: топ не-healthy категорий с готовой фразой и действием.
 * Презентационный компонент — данные приходят из computeCategorySignals.
 * Цвет + иконка + текст (WCAG): изумруд=норма, янтарь=watch/over, красный=риск.
 */
export function SignalFeed({
  signals,
  limit = 3,
  emptyText,
  locale = DEFAULT_LOCALE,
}: {
  signals: CategorySignal[];
  limit?: number;
  emptyText?: string;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const items = signals.slice(0, limit);
  if (items.length === 0) {
    return <p style={{ color: "var(--ink-faint)", fontSize: 13.5 }}>{emptyText ?? tr("sig.allGood")}</p>;
  }
  return (
    <div className="sig-feed">
      {items.map((s) => {
        const tone = STATUS_TONE[s.status];
        const { fg, soft } = TONE_VARS[tone];
        return (
          <div className="sig-item" key={s.category}>
            <div className="sig-ic" style={{ background: soft, color: fg }}>
              {s.status === "new" ? NEW_ICON : WARN_ICON}
            </div>
            <div className="sig-body">
              <b>{categoryLabel(s.category, locale)}</b>
              <p>{s.headline}</p>
              {s.action && (
                <a className="sig-act" href={ACTION_HREF[s.status]} style={{ textDecoration: "none" }}>
                  {s.action} →
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
