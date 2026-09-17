import { sql } from "@/lib/db";
import { getAccountContext } from "@/lib/account/context";
import { EXPENSE_CATEGORIES, PERSONAL_CATEGORIES } from "./categories";

/** Свои категории организации (дополняют базовый таксоном). */
export async function loadCustomCategories(orgId: string): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select name from custom_categories where org_id = ${orgId} order by created_at asc
  `;
  return rows.map((r) => r.name);
}

export interface CustomCategoryUsage {
  name: string;
  txCount: number;      // операций за 90 дней
  monthCents: number;   // потрачено в текущем месяце
}

/** Свои категории со статистикой использования — для менеджера на экране Категории. */
export async function loadCustomCategoriesWithUsage(orgId: string): Promise<CustomCategoryUsage[]> {
  const rows = await sql<{ name: string; tx_count: number; month_cents: string | null }[]>`
    select cc.name,
           count(t.id) filter (where t.occurred_at > now() - interval '90 days')::int as tx_count,
           coalesce(sum(t.gross_cents) filter (
             where t.direction = 'expense' and date_trunc('month', t.occurred_at) = date_trunc('month', now())
           ), 0) as month_cents
    from custom_categories cc
    left join transactions t on t.org_id = cc.org_id and t.category = cc.name
    where cc.org_id = ${orgId}
    group by cc.name, cc.created_at
    order by cc.created_at asc
  `;
  return rows.map((r) => ({ name: r.name, txCount: r.tx_count, monthCents: Number(r.month_cents ?? 0) }));
}

/**
 * Полный список категорий организации: базовый таксоном (личный/бизнес)
 * + пользовательские. Единый источник для селектов, бюджетов и AI.
 */
export async function getCategoriesFor(orgId: string): Promise<string[]> {
  const ctx = await getAccountContext(orgId);
  const base = ctx?.type === "personal" ? PERSONAL_CATEGORIES : EXPENSE_CATEGORIES;
  const custom = await loadCustomCategories(orgId);
  // базовые первыми, свои — после, без дублей
  return [...base, ...custom.filter((c) => !(base as readonly string[]).includes(c))];
}
