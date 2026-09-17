import type { NormalizedTransaction } from "@/types";
import { merchantKey } from "@/lib/merchants";

// Реэкспорт для обратной совместимости — единый ключ мерчанта живёт в lib/merchants.
export { merchantKey };

export interface RecurringExpense {
  merchant: string;
  count: number;
  avgAmountCents: number;
  cadence: "weekly" | "monthly";
  lastChargeAt: string;
  monthlyEstimateCents: number;
  category: string | null;
  daysSinceLast: number;
  stale: boolean;
  // Управление подписками (§ личный режим): проставляются в getSubscriptions.
  matchKey?: string;        // ключ мерчанта — для скрытия авто-подписки
  manualId?: string;        // id ручной подписки — для удаления
  manual?: boolean;         // добавлена пользователем вручную
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const DAY = 86_400_000;

export function detectRecurring(
  txns: NormalizedTransaction[],
  opts: { minCount?: number; asOf?: number; direction?: "income" | "expense" } = {}
): RecurringExpense[] {
  const minCount = opts.minCount ?? 3;
  const asOf = opts.asOf ?? Date.now();
  const direction = opts.direction ?? "expense";

  const groups = new Map<string, NormalizedTransaction[]>();
  for (const t of txns) {
    if (t.direction !== direction) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const out: RecurringExpense[] = [];
  for (const [, items] of groups) {
    if (items.length < minCount) continue;
    const sorted = [...items].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i]!.occurredAt.getTime() - sorted[i - 1]!.occurredAt.getTime()) / DAY);
    }
    const medGap = median(gaps);

    let cadence: "weekly" | "monthly" | null = null;
    if (medGap >= 5 && medGap <= 9) cadence = "weekly";
    else if (medGap >= 24 && medGap <= 38) cadence = "monthly";
    if (!cadence) continue;

    const avg = Math.round(sorted.reduce((s, t) => s + t.grossCents, 0) / sorted.length);
    const monthlyEstimateCents = cadence === "weekly" ? Math.round(avg * 4.33) : avg;
    const last = sorted[sorted.length - 1]!;

    const intervalDays = cadence === "weekly" ? 7 : 30;
    const daysSinceLast = Math.max(0, Math.round((asOf - last.occurredAt.getTime()) / DAY));

    out.push({
      merchant: (last.description ?? "").trim() || "—",
      count: sorted.length,
      avgAmountCents: avg,
      cadence,
      lastChargeAt: last.occurredAt.toISOString().slice(0, 10),
      monthlyEstimateCents,
      category: last.category,
      daysSinceLast,
      stale: daysSinceLast > intervalDays * 1.6,
    });
  }

  return out.sort((a, b) => b.monthlyEstimateCents - a.monthlyEstimateCents);
}

export function recurringMonthlyTotal(items: RecurringExpense[]): number {
  return items.reduce((s, r) => s + r.monthlyEstimateCents, 0);
}


export interface DuplicateCharge {
  merchant: string;
  amountCents: number;
  count: number;
  dates: string[];
}

export function findDuplicateCharges(
  txns: NormalizedTransaction[],
  opts: { withinDays?: number } = {}
): DuplicateCharge[] {
  const withinDays = opts.withinDays ?? 4;

  const groups = new Map<string, NormalizedTransaction[]>();
  for (const t of txns) {
    if (t.direction !== "expense") continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const gk = `${key}|${t.grossCents}`;
    (groups.get(gk) ?? groups.set(gk, []).get(gk)!).push(t);
  }

  const out: DuplicateCharge[] = [];
  for (const [, items] of groups) {
    if (items.length < 2) continue;
    const sorted = [...items].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    let cluster: NormalizedTransaction[] = [sorted[0]!];
    const flush = () => {
      if (cluster.length >= 2) {
        const first = cluster[0]!;
        out.push({
          merchant: (first.description ?? "").trim() || "—",
          amountCents: first.grossCents,
          count: cluster.length,
          dates: cluster.map((t) => t.occurredAt.toISOString().slice(0, 10)),
        });
      }
    };
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i]!.occurredAt.getTime() - cluster[cluster.length - 1]!.occurredAt.getTime()) / DAY;
      if (gap <= withinDays) cluster.push(sorted[i]!);
      else {
        flush();
        cluster = [sorted[i]!];
      }
    }
    flush();
  }

  return out.sort((a, b) => b.amountCents * b.count - a.amountCents * a.count);
}
