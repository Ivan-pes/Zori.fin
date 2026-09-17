import type { NormalizedTransaction } from "@/types";
import { merchantKey } from "./recurring";


export interface VendorSpend {
  vendor: string;
  totalCents: number;
  count: number;
  sharePct: number;
  deltaPct: number | null;
  isNew: boolean;
}

interface Group {
  total: number;
  count: number;
  names: Map<string, number>;
}

function groupExpenses(txns: NormalizedTransaction[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const t of txns) {
    if (t.direction !== "expense") continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { total: 0, count: 0, names: new Map() };
      groups.set(key, g);
    }
    g.total += t.grossCents;
    g.count += 1;
    const name = (t.description ?? "").trim();
    if (name) g.names.set(name, (g.names.get(name) ?? 0) + 1);
  }
  return groups;
}

function displayName(g: Group, fallback: string): string {
  let best = "";
  let bestN = 0;
  for (const [name, n] of g.names) {
    if (n > bestN) {
      best = name;
      bestN = n;
    }
  }
  return best || fallback;
}

export function topVendors(
  txns: NormalizedTransaction[],
  prevTxns: NormalizedTransaction[] = [],
  opts: { limit?: number } = {}
): VendorSpend[] {
  const limit = opts.limit ?? 8;
  const cur = groupExpenses(txns);
  const prev = groupExpenses(prevTxns);

  const totalExpense = [...cur.values()].reduce((s, g) => s + g.total, 0);

  const out: VendorSpend[] = [];
  for (const [key, g] of cur) {
    const p = prev.get(key);
    const prevTotal = p?.total ?? 0;
    out.push({
      vendor: displayName(g, key),
      totalCents: g.total,
      count: g.count,
      sharePct: totalExpense > 0 ? (g.total / totalExpense) * 100 : 0,
      deltaPct: prevTotal > 0 ? ((g.total - prevTotal) / prevTotal) * 100 : null,
      isNew: prevTxns.length > 0 && prevTotal === 0,
    });
  }

  return out.sort((a, b) => b.totalCents - a.totalCents).slice(0, limit);
}
