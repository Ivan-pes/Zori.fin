import type { RecurringExpense } from "./recurring";
import { nextDueDate } from "./calendar";

const DAY = 86_400_000;

export interface UpcomingBill {
  label: string;
  category: string | null;
  amountCents: number;
  dueDate: Date;
  daysUntil: number;
  stale: boolean;         // давно не было активности (возможно, зомби-подписка)
  daysSinceLast: number;
  matchKey?: string;      // ключ мерчанта — чтобы юзер мог скрыть ложный авто-платёж
  manualId?: string;      // id ручной подписки — чтобы её можно было удалить
}

/** Предстоящие обязательные списания в горизонте (из детектора recurring). */
export function computeUpcomingBills(
  recurring: RecurringExpense[],
  opts: { horizonDays: number; asOf?: Date }
): UpcomingBill[] {
  const asOf = opts.asOf ?? new Date();
  const horizon = new Date(asOf.getTime() + opts.horizonDays * DAY);

  const out: UpcomingBill[] = [];
  for (const r of recurring) {
    const dueDate = nextDueDate(r.lastChargeAt, r.cadence, asOf);
    if (dueDate < asOf || dueDate > horizon) continue;
    out.push({
      label: r.merchant,
      category: r.category,
      amountCents: r.avgAmountCents,
      dueDate,
      daysUntil: Math.max(0, Math.round((dueDate.getTime() - asOf.getTime()) / DAY)),
      stale: r.stale,
      daysSinceLast: r.daysSinceLast,
      matchKey: r.matchKey,
      manualId: r.manualId,
    });
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/**
 * Следующая дата списания после due: weekly +7 дней; monthly — тот же день
 * следующего календарного месяца (31-е клампится до конца месяца).
 */
export function nextDueAfter(dueIso: string, cadence: "weekly" | "monthly"): string {
  const d = new Date(`${dueIso.slice(0, 10)}T00:00:00Z`);
  if (cadence === "weekly") {
    return new Date(d.getTime() + 7 * DAY).toISOString().slice(0, 10);
  }
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const daysInNext = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + 1, Math.min(day, daysInNext))).toISOString().slice(0, 10);
}

export interface ManualSubLike {
  amountCents: number;
  cadence: "weekly" | "monthly";
  nextDue: string | null; // 'YYYY-MM-DD'
  category: string | null;
}

/**
 * Суммы ручных регулярных платежей по категориям в окне [from, to):
 * разворачивает вхождения от nextDue с шагом cadence (weekly 7д / monthly ~30д).
 * Питает резервирование бюджетов-конвертов («столько-то на ЗП»).
 */
export function manualSubsByCategory(
  subs: ManualSubLike[],
  from: Date,
  to: Date
): Map<string, number> {
  const out = new Map<string, number>();
  const fromMs = from.getTime();
  const toMs = to.getTime();
  for (const s of subs) {
    if (!s.category) continue;
    const stepMs = (s.cadence === "weekly" ? 7 : 30) * DAY;
    // Без даты считаем, что платёж ожидается уже в начале окна.
    let due = s.nextDue ? new Date(`${s.nextDue.slice(0, 10)}T00:00:00Z`).getTime() : fromMs;
    while (due < fromMs) due += stepMs; // догоняем окно
    for (let guard = 0; due < toMs && guard < 60; due += stepMs, guard++) {
      out.set(s.category, (out.get(s.category) ?? 0) + s.amountCents);
    }
  }
  return out;
}

export interface SubscriptionSummary {
  count: number;
  monthlyCents: number;
  yearlyCents: number;
  staleCount: number;    // сколько «не пользуешься 60+ дней»
}

/** Сводка по подпискам для экрана аудита. */
export function subscriptionSummary(recurring: RecurringExpense[]): SubscriptionSummary {
  const monthlyCents = recurring.reduce((s, r) => s + r.monthlyEstimateCents, 0);
  return {
    count: recurring.length,
    monthlyCents,
    yearlyCents: monthlyCents * 12,
    staleCount: recurring.filter((r) => r.stale).length,
  };
}
