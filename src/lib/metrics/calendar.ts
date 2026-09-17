import type { NormalizedTransaction } from "@/types";
import type { RecurringExpense } from "./recurring";
import type { CashForecast } from "./forecast";

const DAY = 86_400_000;

export type CalItemDir = "in" | "out" | "bill" | "forecast";
export interface CalItem {
  label: string;
  amountCents: number;
  dir: CalItemDir;
}
export interface CalDay {
  day: number;
  inCents: number;
  outCents: number;
  netCents: number;
  items: CalItem[];
  isToday: boolean;
  isFuture: boolean;
  gap: boolean;
}
export interface MonthCalendar {
  year: number;
  month: number;
  daysInMonth: number;
  leadingBlanks: number;
  days: CalDay[];
  totalInCents: number;
  totalOutCents: number;
}

function shortLabel(s: string | null, max = 14): string {
  const t = (s ?? "").trim() || "—";
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function nextDueDate(lastChargeAt: string, cadence: "weekly" | "monthly", from: Date): Date {
  const intervalDays = cadence === "weekly" ? 7 : 30;
  const last = new Date(`${lastChargeAt.slice(0, 10)}T00:00:00Z`);
  let due = last.getTime() + intervalDays * DAY;
  const fromMid = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  while (due < fromMid) due += intervalDays * DAY;
  return new Date(due);
}

export function buildMonthCalendar(
  txns: NormalizedTransaction[],
  opts: { year: number; month: number; today: Date; recurring?: RecurringExpense[]; gapDate?: string | null }
): MonthCalendar {
  const { year, month, today } = opts;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const leadingBlanks = (firstWeekday + 6) % 7;

  const isCurrentMonth = today.getUTCFullYear() === year && today.getUTCMonth() === month;
  const todayDay = isCurrentMonth ? today.getUTCDate() : -1;

  const days: CalDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      day: d,
      inCents: 0,
      outCents: 0,
      netCents: 0,
      items: [],
      isToday: d === todayDay,
      isFuture: isCurrentMonth && d > todayDay,
      gap: false,
    });
  }

  const topIn: (NormalizedTransaction | null)[] = new Array(daysInMonth + 1).fill(null);
  const topOut: (NormalizedTransaction | null)[] = new Array(daysInMonth + 1).fill(null);
  let totalInCents = 0;
  let totalOutCents = 0;

  for (const t of txns) {
    const td = new Date(t.occurredAt);
    if (td.getUTCFullYear() !== year || td.getUTCMonth() !== month) continue;
    const d = td.getUTCDate();
    const cell = days[d - 1];
    if (!cell) continue;
    if (t.direction === "income") {
      cell.inCents += t.grossCents;
      totalInCents += t.grossCents;
      if (!topIn[d] || t.grossCents > topIn[d]!.grossCents) topIn[d] = t;
    } else {
      cell.outCents += t.grossCents;
      totalOutCents += t.grossCents;
      if (!topOut[d] || t.grossCents > topOut[d]!.grossCents) topOut[d] = t;
    }
    cell.netCents = cell.inCents - cell.outCents;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = days[d - 1]!;
    if (topIn[d]) cell.items.push({ label: shortLabel(topIn[d]!.description), amountCents: topIn[d]!.grossCents, dir: "in" });
    if (topOut[d]) cell.items.push({ label: shortLabel(topOut[d]!.description), amountCents: topOut[d]!.grossCents, dir: "out" });
  }

  if (opts.recurring && isCurrentMonth) {
    for (const r of opts.recurring) {
      const due = nextDueDate(r.lastChargeAt, r.cadence, today);
      if (due.getUTCFullYear() === year && due.getUTCMonth() === month) {
        const d = due.getUTCDate();
        const cell = days[d - 1];
        if (cell && d >= todayDay) {
          cell.items.push({ label: shortLabel(r.merchant), amountCents: r.avgAmountCents, dir: "bill" });
        }
      }
    }
  }

  if (opts.gapDate) {
    const g = new Date(`${opts.gapDate.slice(0, 10)}T00:00:00Z`);
    if (g.getUTCFullYear() === year && g.getUTCMonth() === month) {
      const cell = days[g.getUTCDate() - 1];
      if (cell) cell.gap = true;
    }
  }

  return { year, month, daysInMonth, leadingBlanks, days, totalInCents, totalOutCents };
}

export type FeedTone = "green" | "amber" | "red" | "gray";
export interface FeedEvent {
  tone: FeedTone;
  title: string;
  body: string;
  when: string;
}

type FeedT = (key: string, vars?: Record<string, string | number>) => string;

export function buildEventFeed(input: {
  forecast?: CashForecast | null;
  recurring?: RecurringExpense[];
  coverageIncomeOnly?: boolean;
  taxReserveCents?: number | null;
  fmt: (cents: number) => string;
  today: Date;
  t?: FeedT;
  tag?: string;
}): FeedEvent[] {
  const events: FeedEvent[] = [];
  const { forecast, recurring, fmt, today } = input;
  const t: FeedT = input.t ?? ((k) => k);
  const tag = input.tag ?? "ru-RU";
  const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(tag, { day: "numeric", month: "long" });

  if (forecast) {
    if (forecast.gapDate) {
      events.push({
        tone: "red",
        title: t("feed.gapTitle"),
        body: t("feed.gapBody", { date: shortDate(forecast.gapDate), bal: fmt(forecast.gapBalanceCents ?? 0) }),
        when: t("feed.whenForecast"),
      });
    } else {
      events.push({
        tone: "green",
        title: t("feed.forecastTitle"),
        body: t("feed.forecastBody", { n: forecast.horizonDays, bal: fmt(forecast.endBalanceCents) }),
        when: t("feed.whenToday"),
      });
    }
  }

  if (recurring && recurring.length) {
    const soon = recurring
      .map((r) => ({ r, due: nextDueDate(r.lastChargeAt, r.cadence, today) }))
      .filter((x) => {
        const diff = Math.round((x.due.getTime() - today.getTime()) / DAY);
        return diff >= 0 && diff <= 7;
      })
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 2);
    for (const { r, due } of soon) {
      const days = Math.max(0, Math.round((due.getTime() - today.getTime()) / DAY));
      events.push({
        tone: "amber",
        title: t("feed.soonTitle", { amt: fmt(r.avgAmountCents) }),
        body: t("feed.soonBody", { merchant: r.merchant, date: shortDate(due.toISOString()) }),
        when: days === 0 ? t("feed.whenToday") : t("feed.whenInDays", { n: days }),
      });
    }
  }

  if (input.coverageIncomeOnly) {
    events.push({
      tone: "amber",
      title: t("feed.incomeOnlyTitle"),
      body: t("feed.incomeOnlyBody"),
      when: t("feed.whenToday"),
    });
  }

  if (input.taxReserveCents && input.taxReserveCents > 0) {
    events.push({
      tone: "amber",
      title: t("feed.taxTitleEvt"),
      body: t("feed.taxBody", { amt: fmt(input.taxReserveCents) }),
      when: t("feed.whenToday"),
    });
  }

  return events;
}
