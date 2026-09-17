import { sql } from "@/lib/db";
import { loadTransactions } from "@/lib/transactions";
import { expensesByCategory } from "./engine";
import { computeMrrMovements, type SubInput } from "./mrr";
import { loadSubscriptionMetrics } from "./subscriptions";
import { computeCategoryUnitEconomics, type CategoryUnitEconomics } from "./categoryUnitEconomics";

export interface UnitEconomicsResult {
  currency: string;
  econ: CategoryUnitEconomics;
}

/**
 * Юнит-экономика за текущий месяц (CAC / инфра-на-клиента / LTV:CAC).
 * null — если нет синхронизированных подписок Stripe (не с чего считать клиентов).
 * Единый источник для чат-инструмента get_unit_economics и панели на обзоре.
 */
export async function getUnitEconomics(orgId: string): Promise<UnitEconomicsResult | null> {
  const rows = await sql<
    { amount_cents: string; currency: string | null; interval: string | null; interval_count: number; status: string; started_at: Date | null; canceled_at: Date | null; customer_id: string | null }[]
  >`select amount_cents, currency, interval, interval_count, status, started_at, canceled_at, customer_id from stripe_subscriptions where org_id = ${orgId}`;
  if (rows.length === 0) return null;

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const txns = await loadTransactions(orgId, { from, to });
  const totals = new Map(expensesByCategory(txns).map((e) => [e.category, e.totalCents]));

  const subs: SubInput[] = rows.map((r) => ({
    amountCents: Number(r.amount_cents), interval: r.interval, intervalCount: r.interval_count,
    status: r.status, startedAt: r.started_at, canceledAt: r.canceled_at, customerId: r.customer_id,
  }));
  const mrr = computeMrrMovements(subs, from, to, now);
  const saas = await loadSubscriptionMetrics(orgId);

  const econ = computeCategoryUnitEconomics({
    categoryTotals: totals,
    newCustomers: mrr.newCustomers,
    activeClients: saas?.activeClients ?? 0,
    ltvCents: saas?.ltvCents,
  });
  return { currency: saas?.currency ?? txns[0]?.currency ?? "EUR", econ };
}
