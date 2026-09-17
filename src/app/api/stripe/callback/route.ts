import { NextRequest, NextResponse } from "next/server";
import { exchangeStripeCode } from "@/lib/stripe/connect";
import { syncStripeTransactions } from "@/lib/stripe/sync";
import { encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentOrgId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.redirect(`${env.APP_URL}/signin`);
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("stripe_oauth_state")?.value;

  if (url.searchParams.get("error")) {
    return NextResponse.redirect(`${env.APP_URL}/app?stripe=cancelled`);
  }
  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }

  const { stripeUserId, accessToken } = await exchangeStripeCode(code);

  await sql`
    insert into integrations
      (org_id, provider, external_account_id, access_token_enc, scope, status)
    values
      (${orgId}, 'stripe', ${stripeUserId},
       ${accessToken ? encrypt(accessToken) : null}, 'read_write', 'active')
    on conflict (org_id, provider, external_account_id)
      do update set status = 'active'
  `;

  try {
    await syncStripeTransactions(orgId, stripeUserId, { limit: 100 });
  } catch (err) {
    console.error("Stripe sync on connect failed:", err);
  }

  return NextResponse.redirect(`${env.APP_URL}/app?connected=stripe`);
}
