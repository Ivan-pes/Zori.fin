import { sql } from "@/lib/db";
import { getAccountContext } from "@/lib/account/context";
import { merchantKey } from "@/lib/merchants";
import { categorize } from "./engine";
import { categorizeByRulesFor } from "./categories";
import { loadUserRules } from "./rules";
import { loadCustomCategories } from "./custom";

interface Row {
  id: string;
  description: string | null;
  kind: string;
}

export async function categorizeTransactions(orgId: string) {
  const rows = await sql<Row[]>`
    select id, description, kind from transactions
    where org_id = ${orgId} and direction = 'expense' and category is null
  `;

  const ctx = await getAccountContext(orgId);
  const accountType = ctx?.type ?? "business";
  const userRules = await loadUserRules(orgId);
  const customCategories = await loadCustomCategories(orgId);

  const items: Array<{ description: string | null; category: string; method: string }> = [];
  for (const r of rows) {
    const { category, method, confidence, subcategory } = await categorize(r.description, r.kind, {
      accountType,
      userRules,
      customCategories,
    });
    await sql`
      update transactions
      set category = ${category},
          category_method = ${method},
          category_confidence = ${confidence},
          subcategory = ${subcategory}
      where id = ${r.id}
    `;
    items.push({ description: r.description, category, method });
  }

  return {
    updated: items.length,
    aiUsed: items.filter((i) => i.method === "ai").length,
    items,
  };
}

/**
 * Пересчёт категорий ПРАВИЛАМИ (без AI, быстро и бесплатно): полезно после
 * улучшения словаря — например, чтобы инвестиции/переводы из старых выписок
 * перестали числиться тратами. Ручные правки пользователя (method='user')
 * не трогаем; его правила обучения (category_rules) — приоритетнее глобальных.
 */
export async function recategorizeByRules(orgId: string): Promise<{ scanned: number; changed: number }> {
  const rows = await sql<(Row & { category: string | null })[]>`
    select id, description, kind, category from transactions
    where org_id = ${orgId} and direction = 'expense'
      and (category_method is distinct from 'user')
  `;
  const ctx = await getAccountContext(orgId);
  const accountType = ctx?.type ?? "business";
  const userRules = await loadUserRules(orgId);

  let changed = 0;
  for (const r of rows) {
    const key = merchantKey(r.description);
    const byUser = key ? userRules.get(key) : undefined;
    const category = byUser?.category ?? categorizeByRulesFor(accountType, r.description, r.kind);
    if (!category || category === r.category) continue;
    await sql`
      update transactions
      set category = ${category},
          category_method = ${byUser ? "user" : "rule"},
          category_confidence = 1,
          subcategory = ${byUser?.subcategory ?? null}
      where id = ${r.id}
    `;
    changed++;
  }
  return { scanned: rows.length, changed };
}
