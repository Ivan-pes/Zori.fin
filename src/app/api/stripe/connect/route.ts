import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getStripeConnectUrl } from "@/lib/stripe/connect";
import { getCurrentUserId, getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { getOrgPlan } from "@/lib/billing/plan";
import { limit, withinLimit } from "@/lib/billing/entitlements";
import { activeIntegrationsCount } from "@/lib/billing/usage";
import { env } from "@/lib/env";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.redirect(`${env.APP_URL}/signin`);
  }

  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (orgId) {
    const { plan } = await getOrgPlan(orgId);
    if (!withinLimit(plan, "integrations", await activeIntegrationsCount(orgId))) {
      return NextResponse.redirect(`${env.APP_URL}/app/integrations?limit=sources&max=${limit(plan, "integrations")}`);
    }
  }

  const state = randomBytes(16).toString("hex");
  const url = getStripeConnectUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set("stripe_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
