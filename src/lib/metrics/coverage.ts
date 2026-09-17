import { sql } from "@/lib/db";
import type { Plan } from "@/lib/billing/plan";
import { resolveHistoryFloor } from "@/lib/billing/history";
import { classifyMonth, type MonthCoverage } from "./coverage-utils";

export type { MonthCoverage, CoverageSummary } from "./coverage-utils";
export { summarizeCoverage, monthLabel, classifyMonth } from "./coverage-utils";

export async function getCoverage(
  orgId: string,
  _plan: Plan, // сохранён для совместимости сигнатуры; глубина считается по типу орги
  monthsBack = 12
): Promise<MonthCoverage[]> {
  const rows = await sql<
    { month: string; n: number; inc: number; exp: number; sources: string[] }[]
  >`
    select to_char(date_trunc('month', occurred_at), 'YYYY-MM') as month,
           count(*)::int as n,
           count(*) filter (where direction = 'income')::int as inc,
           count(*) filter (where direction = 'expense')::int as exp,
           array_agg(distinct source) as sources
    from transactions
    where org_id = ${orgId}
    group by 1
  `;
  const map = new Map(rows.map((r) => [r.month, r]));
  const cutoff = await resolveHistoryFloor(orgId);

  const out: MonthCoverage[] = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    const locked = cutoff !== null && d < cutoff;
    const r = map.get(key);
    out.push({
      month: key,
      txCount: r?.n ?? 0,
      incomeCount: r?.inc ?? 0,
      expenseCount: r?.exp ?? 0,
      sources: r?.sources ?? [],
      status: classifyMonth(r, locked),
    });
  }
  return out;
}
