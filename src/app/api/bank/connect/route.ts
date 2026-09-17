import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { startAuth } from "@/lib/enablebanking/connect";
import { createAuthRequest } from "@/lib/yapily/connect";
import { requireWritableOrg } from "@/lib/guard-write";
import { getOrgPlan } from "@/lib/billing/plan";
import { limit, withinLimit } from "@/lib/billing/entitlements";
import { activeIntegrationsCount } from "@/lib/billing/usage";
import { bankEnabled, yapilyEnabled, env } from "@/lib/env";

export async function POST(req: NextRequest) {
  if (!bankEnabled) {
    return NextResponse.json({ error: "bank integration disabled" }, { status: 503 });
  }
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { plan } = await getOrgPlan(orgId);
  if (!withinLimit(plan, "integrations", await activeIntegrationsCount(orgId))) {
    return NextResponse.json(
      { error: "limit_reached", scope: "sources", max: limit(plan, "integrations") },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    institutionId?: string;
    institutionName?: string;
    country?: string;
  };
  const aspspName = body.institutionId;
  if (!aspspName) {
    return NextResponse.json({ error: "missing bank" }, { status: 400 });
  }
  const country = (body.country || env.GOCARDLESS_COUNTRY).toUpperCase();
  const state = randomBytes(16).toString("hex");
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1800,
    path: "/",
  } as const;

  try {
    // Yapily: authorisationUrl банка, назад вернёмся с ?consent=… на callback.
    if (yapilyEnabled) {
      const auth = await createAuthRequest({ orgId, institutionId: aspspName });
      const res = NextResponse.json({ link: auth.authorisationUrl });
      res.cookies.set(
        "yp_auth",
        JSON.stringify({
          authRequestId: auth.id,
          institutionName: body.institutionName ?? aspspName,
        }),
        cookieOpts
      );
      return res;
    }

    const auth = await startAuth({ aspspName, country, state });
    const res = NextResponse.json({ link: auth.url });
    res.cookies.set(
      "eb_auth",
      JSON.stringify({
        state,
        institutionName: body.institutionName ?? aspspName,
      }),
      cookieOpts
    );
    return res;
  } catch (err) {
    console.error("bank connect error:", err);
    return NextResponse.json({ error: "failed to start bank connect" }, { status: 502 });
  }
}
