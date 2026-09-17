export interface PlannedItem {
  id: string;
  label: string;
  amountCents: number;               // положительное
  direction: "income" | "expense";
  category: string | null;
  kind: "once" | "monthly";
  startDay: string;                  // 'YYYY-MM-DD'
  endDay: string | null;             // для monthly: отменить с этой даты
}

export interface PlannedOccurrence {
  planId: string;
  day: string;                       // 'YYYY-MM-DD'
  label: string;
  amountCents: number;
  direction: "income" | "expense";
  category: string | null;
  kind: "once" | "monthly";
}

function parseDay(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Разворачивает плановые операции в конкретные даты в диапазоне [from, to). */
export function expandPlanned(items: PlannedItem[], from: Date, to: Date): PlannedOccurrence[] {
  const out: PlannedOccurrence[] = [];
  const fromMs = from.getTime();
  const toMs = to.getTime();

  for (const it of items) {
    const start = parseDay(it.startDay);
    const end = it.endDay ? parseDay(it.endDay) : null;

    const push = (d: Date) => {
      const ms = d.getTime();
      if (ms < fromMs || ms >= toMs) return;
      if (end && ms >= end.getTime()) return;      // отменено с end_day
      out.push({
        planId: it.id, day: ymd(d), label: it.label, amountCents: it.amountCents,
        direction: it.direction, category: it.category, kind: it.kind,
      });
    };

    if (it.kind === "once") {
      push(start);
      continue;
    }

    // monthly: тот же день месяца, начиная со start, пока в диапазоне (кап — 24 мес).
    const anchorDay = start.getUTCDate();
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    for (let i = 0; i < 24; i++) {
      const daysInM = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const d = new Date(Date.UTC(y, m, Math.min(anchorDay, daysInM)));
      if (d.getTime() >= start.getTime()) {
        if (d.getTime() >= toMs) break;
        push(d);
      }
      m++;
      if (m > 11) { m = 0; y++; }
    }
  }

  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Суммарный отток/приток из плановых операций в диапазоне (для safe-to-spend/прогноза). */
export function plannedNetCents(occurrences: PlannedOccurrence[]): { plannedExpenseCents: number; plannedIncomeCents: number } {
  let plannedExpenseCents = 0;
  let plannedIncomeCents = 0;
  for (const o of occurrences) {
    if (o.direction === "expense") plannedExpenseCents += o.amountCents;
    else plannedIncomeCents += o.amountCents;
  }
  return { plannedExpenseCents, plannedIncomeCents };
}
