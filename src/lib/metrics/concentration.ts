
export interface ConcentrationCustomer {
  customer: string;
  mrrCents: number;
  sharePct: number;
}

export interface Concentration {
  customers: ConcentrationCustomer[];
  totalMrrCents: number;
  customerCount: number;
  topSharePct: number;
  top3SharePct: number;
  hhi: number;
  level: "low" | "medium" | "high";
  currency: string;
}

export function computeConcentration(
  input: { customer: string; mrrCents: number }[],
  currency = "EUR",
  opts: { limit?: number } = {}
): Concentration | null {
  const limit = opts.limit ?? 6;
  const positive = input.filter((c) => c.mrrCents > 0);
  if (positive.length === 0) return null;

  const total = positive.reduce((s, c) => s + c.mrrCents, 0);
  const sorted = [...positive].sort((a, b) => b.mrrCents - a.mrrCents);

  const withShare = sorted.map((c) => ({
    customer: c.customer,
    mrrCents: c.mrrCents,
    sharePct: total > 0 ? (c.mrrCents / total) * 100 : 0,
  }));

  const topSharePct = withShare[0]!.sharePct;
  const top3SharePct = withShare.slice(0, 3).reduce((s, c) => s + c.sharePct, 0);
  const hhi = Math.round(withShare.reduce((s, c) => s + c.sharePct * c.sharePct, 0));

  const level: Concentration["level"] =
    topSharePct >= 50 ? "high" : topSharePct >= 30 ? "medium" : "low";

  return {
    customers: withShare.slice(0, limit),
    totalMrrCents: total,
    customerCount: positive.length,
    topSharePct,
    top3SharePct,
    hhi,
    level,
    currency,
  };
}

/**
 * Индекс Херфиндаля–Хиршмана по долям (0..1). shares — доли от целого (сумма ≈ 1).
 * 1 = один игрок (монополия), ~0 = много равных. Единый util для концентрации
 * клиентов и мерчантов внутри категории (§2.6).
 */
export function hhi(shares: number[]): number {
  return shares.reduce((s, x) => s + x * x, 0);
}

export function toMonthlyCents(amountCents: number, interval: string | null, count: number): number {
  const perMonth: Record<string, number> = { day: 30, week: 52 / 12, month: 1, year: 1 / 12 };
  const factor = (perMonth[interval ?? "month"] ?? 1) / Math.max(count, 1);
  return Math.round(amountCents * factor);
}

export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
