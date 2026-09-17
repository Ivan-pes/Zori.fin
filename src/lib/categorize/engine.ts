import { merchantKey } from "@/lib/merchants";
import {
  EXPENSE_CATEGORIES,
  PERSONAL_CATEGORIES,
  categorizeByRulesFor,
} from "./categories";

export type CategoryMethod = "rule" | "ai" | "user";

export interface CategoryResult {
  category: string;
  method: CategoryMethod;
  confidence: number | null; // 0..1; null для детерминированных (rule/user)
  subcategory: string | null;
}

export interface UserRule {
  category: string;
  subcategory?: string | null;
}

export interface CategorizeOptions {
  accountType?: "business" | "personal";
  /** match_key (merchantKey) → правило пользователя; побеждает авто-категоризацию. */
  userRules?: Map<string, UserRule>;
  /** Свои категории пользователя — добавляются в список для AI-классификатора. */
  customCategories?: string[];
}

/**
 * Цепочка категоризации (§4.3): user-rules → global rules → AI(conf) → fallback.
 * Правила пользователя (обучение на исправлениях) имеют высший приоритет и
 * дают мгновенный стабильный результат без обращения к ИИ.
 */
export async function categorize(
  description: string | null,
  kind: string,
  opts: CategorizeOptions = {}
): Promise<CategoryResult> {
  const accountType = opts.accountType ?? "business";

  // 1. Правило пользователя — победитель, уверенность максимальная.
  const key = merchantKey(description);
  const userRule = key ? opts.userRules?.get(key) : undefined;
  if (userRule) {
    return {
      category: userRule.category,
      method: "user",
      confidence: 1,
      subcategory: userRule.subcategory ?? null,
    };
  }

  // 2. Глобальное правило (детерминированное).
  const byRule = categorizeByRulesFor(accountType, description, kind);
  if (byRule) return { category: byRule, method: "rule", confidence: 1, subcategory: null };

  // 3. Нет описания — некуда классифицировать.
  if (!description) return { category: "Прочее", method: "rule", confidence: null, subcategory: null };

  // 4. ИИ с уверенностью. LLM грузим лениво — детерминированные пути (rule/user)
  // не тянут провайдера и env.
  const base = accountType === "personal" ? PERSONAL_CATEGORIES : EXPENSE_CATEGORIES;
  const categories = [
    ...base,
    ...(opts.customCategories ?? []).filter((c) => !(base as readonly string[]).includes(c)),
  ];
  const { getLLM } = await import("@/lib/llm");
  const { category, confidence } = await getLLM().classify(description, categories);
  return { category, method: "ai", confidence, subcategory: null };
}
