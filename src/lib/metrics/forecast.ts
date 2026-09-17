import type { NormalizedTransaction } from "@/types";

export interface ForecastPoint {
  date: string;
  balanceCents: number;
  kind: "actual" | "forecast";
  loCents?: number;
  hiCents?: number;
}

export interface CashForecast {
  points: ForecastPoint[];
  startingBalanceCents: number;
  endBalanceCents: number;
  endDeltaCents: number;
  avgDailyNetCents: number;
  minBalanceCents: number;
  gapDate: string | null;
  gapBalanceCents: number | null;
  thresholdCents: number;
  horizonDays: number;
  daysWithActivity: number;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ScenarioAssumptions {
  monthlyDeltaCents?: number;
  oneOffCents?: number;
  oneOffDay?: number;
}

export function forecastCashFlow(
  txns: NormalizedTransaction[],
  startingBalanceCents: number,
  opts: {
    horizonDays?: number;
    thresholdCents?: number;
    lookbackDays?: number;
    scenario?: ScenarioAssumptions;
    plannedByDate?: Record<string, number>;   // 'YYYY-MM-DD' → плановый net за день (доход +, трата −)
  } = {}
): CashForecast {
  const horizonDays = opts.horizonDays ?? 30;
  const thresholdCents = opts.thresholdCents ?? 0;
  const lookbackDays = opts.lookbackDays ?? 30;
  const plannedByDate = opts.plannedByDate ?? {};
  const scn = opts.scenario;
  const dailyDeltaCents = scn?.monthlyDeltaCents ? scn.monthlyDeltaCents / 30 : 0;
  const oneOffCents = scn?.oneOffCents ?? 0;
  const oneOffDay = Math.max(1, scn?.oneOffDay ?? 1);

  const netByDay = new Map<string, number>();
  for (const t of txns) {
    const k = dayKey(t.occurredAt);
    netByDay.set(k, (netByDay.get(k) ?? 0) + t.netCents);
  }
  const dailyVals = [...netByDay.values()];
  const totalNet = dailyVals.reduce((a, b) => a + b, 0);
  const avgDailyNetCents = Math.round(totalNet / lookbackDays);
  const daysWithActivity = netByDay.size;

  const mean = dailyVals.length ? totalNet / dailyVals.length : 0;
  const variance = dailyVals.length
    ? dailyVals.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyVals.length
    : 0;
  const stdev = Math.max(Math.sqrt(variance), Math.abs(avgDailyNetCents) * 1.5, 1);

  const today = new Date();
  const points: ForecastPoint[] = [];

  let running = startingBalanceCents - totalNet;
  for (const k of [...netByDay.keys()].sort()) {
    running += netByDay.get(k)!;
    points.push({ date: k, balanceCents: running, kind: "actual" });
  }
  const todayKey = dayKey(today);
  const last = points.at(-1);
  if (!last || last.date !== todayKey) {
    points.push({ date: todayKey, balanceCents: startingBalanceCents, kind: "actual" });
  }

  let minBalanceCents = startingBalanceCents;
  let gapDate: string | null = null;
  let gapBalanceCents: number | null = null;
  let plannedCum = 0;
  for (let d = 1; d <= horizonDays; d++) {
    const date = dayKey(new Date(today.getTime() + d * 86_400_000));
    const oneOff = d >= oneOffDay ? oneOffCents : 0;
    plannedCum += plannedByDate[date] ?? 0;   // накапливаем плановые движения
    const bal = Math.round(startingBalanceCents + (avgDailyNetCents + dailyDeltaCents) * d + oneOff + plannedCum);
    const spread = Math.round(stdev * Math.sqrt(d));
    points.push({ date, balanceCents: bal, kind: "forecast", loCents: bal - spread, hiCents: bal + spread });
    if (bal < minBalanceCents) minBalanceCents = bal;
    if (gapDate === null && bal < thresholdCents) {
      gapDate = date;
      gapBalanceCents = bal;
    }
  }

  const plannedTotal = Object.values(plannedByDate).reduce((a, b) => a + b, 0);
  const endBalanceCents = Math.round(
    startingBalanceCents + (avgDailyNetCents + dailyDeltaCents) * horizonDays + oneOffCents + plannedTotal
  );
  return {
    points,
    startingBalanceCents,
    endBalanceCents,
    endDeltaCents: endBalanceCents - startingBalanceCents,
    avgDailyNetCents,
    minBalanceCents,
    gapDate,
    gapBalanceCents,
    thresholdCents,
    horizonDays,
    daysWithActivity,
  };
}
