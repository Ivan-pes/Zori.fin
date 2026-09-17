import { getOrgPlan } from "@/lib/billing/plan";
import { can, type Feature } from "@/lib/billing/entitlements";

export async function requireFeature(orgId: string, feature: Feature) {
  const { plan } = await getOrgPlan(orgId);
  return { allowed: can(plan, feature), plan };
}
