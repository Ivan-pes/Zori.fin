import type { NormalizedTransaction } from "@/types";

export interface AnomalyFlag {
  description: string;
  amountCents: number;
  category: string;
  occurredAt: string;
  reason: string;
  zScore: number;
}

type AnomalyT = (key: string, vars?: Record<string, string | number>) => string;

export function detectAnomalies(
  txns: NormalizedTransaction[],
  opts: { zThreshold?: number; minSamples?: number; minAmountCents?: number; t?: AnomalyT } = {}
): AnomalyFlag[] {
  const zThreshold = opts.zThreshold ?? 2.5;
  const minSamples = opts.minSamples ?? 4;
  const minAmountCents = opts.minAmountCents ?? 2000;
  const t: AnomalyT = opts.t ?? ((k) => k);

  const groups = new Map<string, NormalizedTransaction[]>();
  for (const t of txns) {
    if (t.direction !== "expense") continue;
    const cat = t.category ?? "Прочее";
    (groups.get(cat) ?? groups.set(cat, []).get(cat)!).push(t);
  }

  const flags: AnomalyFlag[] = [];
  for (const [cat, items] of groups) {
    if (items.length < minSamples) continue;
    const amounts = items.map((t) => t.grossCents);
    const n = amounts.length;
    const sum = amounts.reduce((a, b) => a + b, 0);
    const sumSq = amounts.reduce((a, b) => a + b * b, 0);

    for (const tx of items) {
      if (tx.grossCents < minAmountCents) continue;
      const x = tx.grossCents;
      const meanO = (sum - x) / (n - 1);
      const varO = (sumSq - x * x) / (n - 1) - meanO * meanO;
      const stdevO = Math.sqrt(Math.max(varO, 0));
      if (stdevO <= 0 || meanO <= 0) continue;
      const z = (x - meanO) / stdevO;
      if (z >= zThreshold && x > meanO) {
        flags.push({
          description: (tx.description ?? "").trim() || t("anom.noDesc"),
          amountCents: x,
          category: cat,
          occurredAt: tx.occurredAt.toISOString().slice(0, 10),
          reason: t("anom.reason", { x: (x / meanO).toFixed(1), cat }),
          zScore: Math.round(z * 10) / 10,
        });
      }
    }
  }

  return flags.sort((a, b) => b.amountCents - a.amountCents);
}
