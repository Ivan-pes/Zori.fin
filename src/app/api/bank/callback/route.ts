import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/enablebanking/connect";
import { syncBankAccounts } from "@/lib/enablebanking/sync";
import { syncYapilyIntegration } from "@/lib/yapily/sync";
import { categorizeTransactions } from "@/lib/categorize/run";
import { encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentOrgId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.redirect(`${env.APP_URL}/signin`);
  }

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) {
    return NextResponse.redirect(`${env.APP_URL}/app/integrations?bank=cancelled`);
  }

  // ── Yapily: назад приходим с ?consent=<токен> ──────────────────────────
  const ypCookie = req.cookies.get("yp_auth")?.value;
  if (ypCookie) {
    let saved: { authRequestId: string; institutionName: string } | null = null;
    try {
      saved = JSON.parse(ypCookie);
    } catch {
      saved = null;
    }
    const consent = sp.get("consent");
    if (!saved || !consent) {
      return NextResponse.redirect(`${env.APP_URL}/app/integrations?bank=error`);
    }

    try {
      // provider='gocardless' — общий маркер «банк» (CHECK в схеме);
      // настоящий провайдер — в metadata. Consent-токен шифруем как у Stripe.
      await sql`
        insert into integrations
          (org_id, provider, external_account_id, access_token_enc, scope, status, metadata)
        values
          (${orgId}, 'gocardless', ${saved.authRequestId}, ${encrypt(consent)},
           'read_only', 'active',
           ${sql.json({ provider: "yapily", institution_name: saved.institutionName })})
        on conflict (org_id, provider, external_account_id)
          do update set status = 'active', access_token_enc = excluded.access_token_enc,
            metadata = excluded.metadata
      `;

      try {
        await syncYapilyIntegration(orgId, saved.authRequestId, consent);
        await categorizeTransactions(orgId);
      } catch (err) {
        console.error("yapily sync on connect failed:", err);
      }

      const res = NextResponse.redirect(`${env.APP_URL}/app?connected=bank`);
      res.cookies.delete("yp_auth");
      return res;
    } catch (err) {
      console.error("yapily callback error:", err);
      return NextResponse.redirect(`${env.APP_URL}/app/integrations?bank=error`);
    }
  }

  // ── Enable Banking: ?code=… + state из cookie ──────────────────────────
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code) {
    return NextResponse.redirect(`${env.APP_URL}/app/integrations?bank=error`);
  }

  const cookie = req.cookies.get("eb_auth")?.value;
  let saved: { state: string; institutionName: string } | null = null;
  try {
    saved = cookie ? JSON.parse(cookie) : null;
  } catch {
    saved = null;
  }
  if (!saved || (state && saved.state !== state)) {
    return NextResponse.redirect(`${env.APP_URL}/app/integrations?bank=error`);
  }

  try {
    const session = await createSession(code);
    const accountUids = (session.accounts ?? []).map((a) => a.uid).filter(Boolean);
    if (accountUids.length === 0) {
      return NextResponse.redirect(`${env.APP_URL}/app/integrations?bank=pending`);
    }

    await sql`
      insert into integrations
        (org_id, provider, external_account_id, scope, status, metadata)
      values
        (${orgId}, 'gocardless', ${session.session_id}, 'read_only', 'active',
         ${sql.json({
           provider: "enablebanking",
           institution_name: saved.institutionName,
           accounts: accountUids,
         })})
      on conflict (org_id, provider, external_account_id)
        do update set status = 'active', metadata = excluded.metadata
    `;

    try {
      await syncBankAccounts(orgId, session.session_id, accountUids);
      await categorizeTransactions(orgId);
    } catch (err) {
      console.error("bank sync on connect failed:", err);
    }

    const res = NextResponse.redirect(`${env.APP_URL}/app?connected=bank`);
    res.cookies.delete("eb_auth");
    return res;
  } catch (err) {
    console.error("bank callback error:", err);
    return NextResponse.redirect(`${env.APP_URL}/app/integrations?bank=error`);
  }
}
