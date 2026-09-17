export interface GoalProgress {
  pct: number;
  remainingCents: number;
  etaMonths: number | null;
  etaLabel: string | null;
  done: boolean;
}

const MONTHS = ["январю", "февралю", "марту", "апрелю", "маю", "июню", "июлю", "августу", "сентябрю", "октябрю", "ноябрю", "декабрю"];

export function goalProgress(
  goal: { targetCents: number; currentCents: number },
  monthlySavingsCents: number,
  now: Date = new Date()
): GoalProgress {
  const target = Math.max(0, goal.targetCents);
  const current = Math.max(0, goal.currentCents);
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : 0;
  const remainingCents = Math.max(0, target - current);

  if (remainingCents === 0) {
    return { pct: 100, remainingCents: 0, etaMonths: 0, etaLabel: "цель достигнута", done: true };
  }
  if (monthlySavingsCents <= 0) {
    return { pct, remainingCents, etaMonths: null, etaLabel: null, done: false };
  }

  const etaMonths = Math.ceil(remainingCents / monthlySavingsCents);
  let etaLabel: string;
  if (etaMonths <= 12) {
    const m = (now.getUTCMonth() + etaMonths) % 12;
    etaLabel = `к ${MONTHS[m]}`;
  } else {
    etaLabel = `≈ ${etaMonths} мес`;
  }
  return { pct, remainingCents, etaMonths, etaLabel, done: false };
}
