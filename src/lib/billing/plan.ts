import { sql } from "@/lib/db";

export type Plan = "free" | "starter" | "growth" | "pro";

export interface OrgPlan {
  plan: Plan;
  active: boolean;
}

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

type SubRow = {
  plan: string | null;
  status: string;
  current_period_end: Date | null;
  comped: boolean | null;
};

export async function getOrgPlan(orgId: string): Promise<OrgPlan> {
  const [sub] = await sql<SubRow[]>`
    select plan, status, current_period_end, comped from subscriptions where org_id = ${orgId}
  `;
  // Бессрочный доступ: план активен всегда, срок и статус не смотрим.
  if (sub?.comped) return { plan: (sub.plan as Plan) ?? "pro", active: true };
  if (!sub || !ACTIVE_STATUSES.has(sub.status)) return { plan: "free", active: false };
  if (sub.current_period_end && new Date(sub.current_period_end).getTime() < Date.now()) {
    return { plan: "free", active: false };
  }
  return { plan: (sub.plan as Plan) ?? "free", active: true };
}

export function isGrowthPlus(plan: Plan): boolean {
  return plan === "growth" || plan === "pro";
}

// Личный тариф пространства: free_personal по умолчанию; plus при подписке
// Plus; Pro (99€, «все фичи бизнеса и личного») включает весь личный уровень.
export async function getPersonalPlan(orgId: string): Promise<"free_personal" | "plus"> {
  const [sub] = await sql<SubRow[]>`
    select plan, status, current_period_end, comped from subscriptions where org_id = ${orgId}
  `;
  if (!sub) return "free_personal";
  if (!sub.comped) {
    if (!ACTIVE_STATUSES.has(sub.status)) return "free_personal";
    if (sub.current_period_end && new Date(sub.current_period_end).getTime() < Date.now()) {
      return "free_personal";
    }
  }
  return sub.plan === "plus" || sub.plan === "pro" ? "plus" : "free_personal";
}

/** Бессрочный доступ, выданный вручную (Stripe не платит). */
export async function isComped(orgId: string): Promise<boolean> {
  const [sub] = await sql<{ comped: boolean | null }[]>`
    select comped from subscriptions where org_id = ${orgId}
  `;
  return sub?.comped === true;
}

export const TRIAL_DAYS = 10;

export async function startProTrial(orgId: string): Promise<void> {
  const endsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  await sql`
    insert into subscriptions (org_id, plan, status, current_period_end)
    values (${orgId}, 'pro', 'trialing', ${endsAt})
    on conflict (org_id) do nothing
  `;
}

export async function getTrialInfo(
  orgId: string
): Promise<{ trialing: boolean; endsAt: Date | null }> {
  const [sub] = await sql<{ status: string; current_period_end: Date | null; stripe_customer_id: string | null; comped: boolean | null }[]>`
    select status, current_period_end, stripe_customer_id, comped from subscriptions where org_id = ${orgId}
  `;
  const trialing =
    !!sub &&
    !sub.comped &&
    sub.status === "trialing" &&
    !sub.stripe_customer_id &&
    (!sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now());
  return { trialing, endsAt: sub?.current_period_end ?? null };
}

export async function markSubscriptionActive(
  orgId: string,
  stripeCustomerId: string | null,
  plan: string | null
): Promise<void> {
  // Строку с бессрочным доступом Stripe не переписывает.
  await sql`
    insert into subscriptions (org_id, stripe_customer_id, plan, status)
    values (${orgId}, ${stripeCustomerId}, ${plan}, 'active')
    on conflict (org_id) do update
      set stripe_customer_id = excluded.stripe_customer_id, plan = excluded.plan, status = 'active'
      where subscriptions.comped = false
  `;
}

/**
 * Выдать/снять бессрочный доступ (подарок, амбассадор, тестовый партнёр).
 * Stripe при этом не участвует: Checkout закрыт, вебхук строку не трогает.
 */
export async function setComped(
  orgId: string,
  comped: boolean,
  plan: Plan | "plus" = "pro",
  note: string | null = null
): Promise<void> {
  if (comped) {
    await sql`
      insert into subscriptions (org_id, plan, status, current_period_end, comped, comp_note)
      values (${orgId}, ${plan}, 'active', null, true, ${note})
      on conflict (org_id) do update
        set plan = excluded.plan, status = 'active', current_period_end = null,
            comped = true, comp_note = excluded.comp_note
    `;
  } else {
    await sql`
      update subscriptions set comped = false, comp_note = null, status = 'canceled'
      where org_id = ${orgId}
    `;
  }
}
