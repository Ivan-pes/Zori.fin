/**
 * Юнит-экономика категорий (§2.12, только бизнес). Привязывает расходную статью
 * к бизнес-знаменателю, превращая «сколько потратили» в метрику эффективности:
 *   • CAC = «Реклама и маркетинг» / число новых клиентов;
 *   • инфраструктура на клиента = «ПО и подписки» / активные клиенты;
 *   • LTV/CAC — окупаемость привлечения (если известен LTV).
 *
 * Чистая детерминированная функция. Знаменатели (newCustomers/activeClients/ltv)
 * приходят из mrr.ts / subscriptions.ts; траты — из expensesByCategory (в базовой
 * валюте). Деньги — в центах.
 */

export const DEFAULT_MARKETING_CATEGORY = "Реклама и маркетинг";
export const DEFAULT_INFRA_CATEGORY = "ПО и подписки";

export interface CategoryUnitEconomicsInput {
  /** category → траты за период (базовая валюта, центы). */
  categoryTotals: Map<string, number>;
  /** новые клиенты за период (из computeMrrMovements). */
  newCustomers: number;
  /** активные клиенты сейчас (из loadSubscriptionMetrics). */
  activeClients: number;
  /** LTV клиента, центы (опц., для LTV/CAC). */
  ltvCents?: number;
  marketingCategory?: string;
  infraCategory?: string;
}

export interface CategoryUnitEconomics {
  marketingCents: number;
  newCustomers: number;
  cacCents: number | null; // затраты на привлечение одного клиента

  infraCents: number;
  activeClients: number;
  infraPerCustomerCents: number | null; // инфраструктура на активного клиента

  ltvCents: number | null;
  ltvToCacRatio: number | null; // >3 — здоровая экономика привлечения
}

export function computeCategoryUnitEconomics(
  input: CategoryUnitEconomicsInput
): CategoryUnitEconomics {
  const marketingCat = input.marketingCategory ?? DEFAULT_MARKETING_CATEGORY;
  const infraCat = input.infraCategory ?? DEFAULT_INFRA_CATEGORY;

  const marketingCents = input.categoryTotals.get(marketingCat) ?? 0;
  const infraCents = input.categoryTotals.get(infraCat) ?? 0;

  const cacCents = input.newCustomers > 0 ? Math.round(marketingCents / input.newCustomers) : null;
  const infraPerCustomerCents =
    input.activeClients > 0 ? Math.round(infraCents / input.activeClients) : null;

  const ltvCents = input.ltvCents != null && input.ltvCents > 0 ? input.ltvCents : null;
  const ltvToCacRatio =
    ltvCents != null && cacCents != null && cacCents > 0
      ? Math.round((ltvCents / cacCents) * 10) / 10
      : null;

  return {
    marketingCents,
    newCustomers: input.newCustomers,
    cacCents,
    infraCents,
    activeClients: input.activeClients,
    infraPerCustomerCents,
    ltvCents,
    ltvToCacRatio,
  };
}
