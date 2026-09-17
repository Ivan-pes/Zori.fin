export interface Runway {
  monthlyNetCents: number;
  profitable: boolean;
  burnRateCents: number;
  runwayMonths: number | null;
  runoutDate: string | null;
}

const DAY = 86_400_000;

export function computeRunway(
  balanceCents: number,
  avgDailyNetCents: number,
  now: Date = new Date()
): Runway {
  const monthlyNet = Math.round(avgDailyNetCents * 30);
  if (monthlyNet >= 0) {
    return { monthlyNetCents: monthlyNet, profitable: true, burnRateCents: 0, runwayMonths: null, runoutDate: null };
  }
  const burn = -monthlyNet;
  const months = balanceCents > 0 ? balanceCents / burn : 0;
  const runoutDate = new Date(now.getTime() + months * 30 * DAY).toISOString().slice(0, 10);
  return {
    monthlyNetCents: monthlyNet,
    profitable: false,
    burnRateCents: burn,
    runwayMonths: Math.round(months * 10) / 10,
    runoutDate,
  };
}
