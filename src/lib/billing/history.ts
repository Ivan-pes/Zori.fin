import type { Plan } from "@/lib/billing/plan";
import { limit } from "@/lib/billing/entitlements";

export function earliestAllowed(plan: Plan, now = new Date()): Date | null {
  const m = limit(plan, "historyMonths");
  if (m === -1) return null;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
  return d;
}

/**
 * Глубина истории с учётом ТИПА пространства: личные орги гейтятся личной
 * сеткой (Plus/Pro = безлимит), бизнес — бизнесовой. Иначе личный Plus
 * попадает в бизнес-фолбэк free и история режется до 3 месяцев
 * («максимум 4 месяца» — реальный баг).
 */
export async function resolveHistoryFloor(orgId: string, now = new Date()): Promise<Date | null> {
  const { getAccountContext } = await import("@/lib/account/context");
  const { getOrgPlan, getPersonalPlan } = await import("@/lib/billing/plan");
  const ctx = await getAccountContext(orgId);
  if (ctx?.type === "personal") {
    const { limitP } = await import("@/lib/billing/entitlements.personal");
    const m = limitP(await getPersonalPlan(orgId), "historyMonths");
    if (m === -1) return null;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
  }
  return earliestAllowed((await getOrgPlan(orgId)).plan, now);
}
