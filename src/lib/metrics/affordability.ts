export interface AffordInput {
  amountCents: number;
  recurring: boolean;
  avgDailyNetCents: number;
  balanceCents: number;
  thresholdCents: number;
}

export interface AffordResult {
  verdict: "ok" | "risk";
  oldDailyFlowCents: number;
  newDailyFlowCents: number;
  newRunwayMonths: number | null;
}

export function computeAffordability(i: AffordInput): AffordResult {
  const oldDaily = i.avgDailyNetCents;
  const dailyDelta = i.recurring ? Math.round(i.amountCents / 30) : 0;
  const newDaily = oldDaily - dailyDelta;
  const startBalance = i.balanceCents - (i.recurring ? 0 : i.amountCents);

  let newRunwayMonths: number | null = null;
  if (newDaily < 0) {
    const burnPerMonth = -newDaily * 30;
    newRunwayMonths = Math.max(0, (startBalance - i.thresholdCents) / burnPerMonth);
  }

  const oneOffOk = i.recurring ? true : startBalance >= i.thresholdCents;
  const flowOk = newDaily >= 0 ? true : newRunwayMonths !== null && newRunwayMonths >= 6;

  return {
    verdict: oneOffOk && flowOk ? "ok" : "risk",
    oldDailyFlowCents: oldDaily,
    newDailyFlowCents: newDaily,
    newRunwayMonths,
  };
}
