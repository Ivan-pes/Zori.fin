import { sql } from "@/lib/db";
import { merchantKey } from "@/lib/merchants";
import type { UserRule } from "./engine";

interface RuleRow {
  match_key: string;
  category: string;
  subcategory: string | null;
}

/**
 * Правила пользователя организации: merchantKey → категория (§4.3).
 * Загружаются один раз и внедряются в categorize() как Map.
 */
export async function loadUserRules(orgId: string): Promise<Map<string, UserRule>> {
  const rows = await sql<RuleRow[]>`
    select match_key, category, subcategory from category_rules where org_id = ${orgId}
  `;
  return new Map(rows.map((r) => [r.match_key, { category: r.category, subcategory: r.subcategory }]));
}

/**
 * Обучение на исправлении: когда пользователь меняет категорию транзакции,
 * апсертим правило по merchantKey(description) — впредь тот же мерчант
 * категоризируется мгновенно и стабильно. Пустой ключ (нет описания) — пропускаем.
 */
export async function upsertUserRule(
  orgId: string,
  description: string | null,
  category: string,
  subcategory: string | null = null
): Promise<boolean> {
  const key = merchantKey(description);
  if (!key) return false;
  await sql`
    insert into category_rules (org_id, match_key, category, subcategory)
    values (${orgId}, ${key}, ${category}, ${subcategory})
    on conflict (org_id, match_key)
    do update set category = excluded.category,
                  subcategory = excluded.subcategory,
                  created_at = now()
  `;
  return true;
}
