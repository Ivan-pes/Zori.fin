import { sql } from "@/lib/db";
import type { PlannedItem } from "@/lib/metrics/planned";

export async function loadPlannedItems(orgId: string): Promise<PlannedItem[]> {
  const rows = await sql<{
    id: string; label: string; amount_cents: string; direction: string;
    category: string | null; kind: string; start_day: string; end_day: string | null;
  }[]>`
    select id, label, amount_cents, direction, category, kind,
           start_day::text as start_day, end_day::text as end_day
    from planned_items where org_id = ${orgId}
    order by start_day asc
  `;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    amountCents: Number(r.amount_cents),
    direction: r.direction === "income" ? "income" : "expense",
    category: r.category,
    kind: r.kind === "monthly" ? "monthly" : "once",
    startDay: r.start_day,
    endDay: r.end_day,
  }));
}
