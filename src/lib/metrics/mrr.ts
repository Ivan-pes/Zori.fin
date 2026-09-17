export interface SubInput {
  amountCents: number;
  interval: string | null;
  intervalCount: number;
  status: string;
  startedAt: Date | null;
  canceledAt: Date | null;
  customerId: string | null;
}

export interface MrrMovements {
  mrrNowCents: number;
  newMrrCents: number;
  churnedMrrCents: number;
  netNewMrrCents: number;
  newCustomers: number;
  churnedCustomers: number;
  quickRatio: number | null;
  retentionPct: number | null;
  hasExpansionData: false;
}

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function toMonthlyCents(amountCents: number, interval: string | null, count: number): number {
  const perMonth: Record<string, number> = { day: 30, week: 52 / 12, month: 1, year: 1 / 12 };
  const factor = (perMonth[interval ?? "month"] ?? 1) / Math.max(count, 1);
  return Math.round(amountCents * factor);
}

export function computeMrrMovements(
  rows: SubInput[],
  from: Date,
  to: Date,
  now: Date = new Date()
): MrrMovements {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const nowMs = now.getTime();

  let mrrNowCents = 0;
  let newMrrCents = 0;
  let churnedMrrCents = 0;
  let newCustomers = 0;
  let churnedCustomers = 0;
  let startMrrCents = 0;
  let retainedMrrCents = 0;

  for (const r of rows) {
    const monthly = toMonthlyCents(r.amountCents, r.interval, r.intervalCount);
    const active = ACTIVE_STATUSES.has(r.status);
    const startedMs = r.startedAt ? r.startedAt.getTime() : null;
    const canceledMs = r.canceledAt ? r.canceledAt.getTime() : null;

    if (active) mrrNowCents += monthly;

    if (active && startedMs !== null && startedMs >= fromMs && startedMs < toMs) {
      newMrrCents += monthly;
      newCustomers += 1;
    }
    if (canceledMs !== null && canceledMs >= fromMs && canceledMs < toMs) {
      churnedMrrCents += monthly;
      churnedCustomers += 1;
    }
    const activeAtStart = startedMs !== null && startedMs < fromMs && (canceledMs === null || canceledMs >= fromMs);
    if (activeAtStart) {
      startMrrCents += monthly;
      const stillActive = active && (canceledMs === null || canceledMs >= nowMs);
      if (stillActive) retainedMrrCents += monthly;
    }
  }

  return {
    mrrNowCents,
    newMrrCents,
    churnedMrrCents,
    netNewMrrCents: newMrrCents - churnedMrrCents,
    newCustomers,
    churnedCustomers,
    quickRatio: churnedMrrCents > 0 ? Math.round((newMrrCents / churnedMrrCents) * 10) / 10 : null,
    retentionPct: startMrrCents > 0 ? Math.round((retainedMrrCents / startMrrCents) * 1000) / 10 : null,
    hasExpansionData: false,
  };
}
