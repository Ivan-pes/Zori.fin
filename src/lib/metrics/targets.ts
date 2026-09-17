
export type TargetMetric = "revenue" | "expense" | "profit";

export interface BudgetProgress {
  metric: TargetMetric;
  targetCents: number;
  actualCents: number;
  pct: number;
  projectedCents: number;
  projectedPct: number;
  onTrack: boolean;
}

export function computeBudgetProgress(
  metric: TargetMetric,
  targetCents: number,
  actualCents: number,
  dayOfMonth: number,
  daysInMonth: number
): BudgetProgress {
  const pct = targetCents !== 0 ? (actualCents / targetCents) * 100 : 0;
  const day = Math.min(Math.max(dayOfMonth, 1), daysInMonth);
  const projectedCents = Math.round((actualCents / day) * daysInMonth);
  const projectedPct = targetCents !== 0 ? (projectedCents / targetCents) * 100 : 0;

  const onTrack =
    metric === "expense" ? projectedCents <= targetCents : projectedCents >= targetCents;

  return { metric, targetCents, actualCents, pct, projectedCents, projectedPct, onTrack };
}

export const METRIC_LABEL: Record<TargetMetric, string> = {
  revenue: "Выручка",
  expense: "Расходы",
  profit: "Чистая прибыль",
};
