import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { syncStripeTransactions } from "@/lib/stripe/sync";
import { syncStripeSubscriptions } from "@/lib/stripe/subscriptions-sync";
import { syncBankIntegration } from "@/lib/gocardless/sync";
import { syncBankIntegration as syncEbIntegration } from "@/lib/enablebanking/sync";
import { syncYapilyIntegration } from "@/lib/yapily/sync";
import { decrypt } from "@/lib/crypto";
import { categorizeTransactions } from "@/lib/categorize/run";
import { checkOrgCashGap, type AlertOrgRow } from "@/lib/alerts/cashflow";
import { writeNetWorthSnapshots } from "@/lib/personal/data";
import { getOrgPlan, getPersonalPlan } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { canP } from "@/lib/billing/entitlements.personal";

export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const integrations = await sql<{ org_id: string; external_account_id: string }[]>`
    select org_id, external_account_id from integrations
    where provider = 'stripe' and status = 'active'
  `;

  let transactionsSynced = 0;
  for (const intg of integrations) {
    try {
      transactionsSynced += await syncStripeTransactions(
        intg.org_id,
        intg.external_account_id,
        { limit: 100 }
      );
      await categorizeTransactions(intg.org_id);
      await syncStripeSubscriptions(intg.org_id, intg.external_account_id);
    } catch (err) {
      console.error(`[cron] синк org ${intg.org_id} не удался:`, err);
    }
  }

  const bankIntegrations = await sql<
    {
      org_id: string;
      external_account_id: string;
      access_token_enc: string | null;
      metadata: { provider?: string; accounts?: string[] };
    }[]
  >`
    select org_id, external_account_id, access_token_enc, metadata from integrations
    where provider = 'gocardless' and status = 'active'
  `;
  for (const intg of bankIntegrations) {
    try {
      // YAXI — клиентский флоу (синк только с фронта), серверного консента нет.
      if (intg.metadata?.provider === "yaxi") continue;
      if (intg.metadata?.provider === "yapily") {
        if (!intg.access_token_enc) continue;
        transactionsSynced += await syncYapilyIntegration(
          intg.org_id,
          intg.external_account_id,
          decrypt(intg.access_token_enc)
        );
      } else if (intg.metadata?.provider === "enablebanking") {
        transactionsSynced += await syncEbIntegration(
          intg.org_id,
          intg.external_account_id,
          intg.metadata
        );
      } else {
        transactionsSynced += await syncBankIntegration(
          intg.org_id,
          intg.external_account_id,
          intg.metadata
        );
      }
      await categorizeTransactions(intg.org_id);
    } catch (err) {
      console.error(`[cron] банк-синк org ${intg.org_id} не удался:`, err);
    }
  }

  const orgs = await sql<(AlertOrgRow & { type: string | null; notification_prefs: Record<string, unknown> | null })[]>`
    select o.id, o.name, o.current_balance_cents, o.safe_threshold_cents,
           o.last_alerted_gap_date::text as last_alerted_gap_date,
           o.type, o.notification_prefs,
           u.email as owner_email
    from organizations o
    left join users u on u.id = o.owner_id
    where o.current_balance_cents is not null
  `;

  let alertsSent = 0;
  for (const org of orgs) {
    try {
      if (org.type === "personal") {
        // Личное: алерт «мало на счету» — фича Plus И только если человек сам включил оповещение (opt-in).
        const optedIn = org.notification_prefs?.gap === true;
        if (!optedIn) continue;
        if (!canP(await getPersonalPlan(org.id), "cashAlerts")) continue;
        if ((await checkOrgCashGap(org, true)) === "sent") alertsSent++;
      } else {
        const { plan } = await getOrgPlan(org.id);
        if (!can(plan, "cashGapAlerts")) continue;
        if ((await checkOrgCashGap(org)) === "sent") alertsSent++;
      }
    } catch (err) {
      console.error(`[cron] алерт org ${org.id} не удался:`, err);
    }
  }

  let netWorthSnapshots = 0;
  try {
    netWorthSnapshots = await writeNetWorthSnapshots();
  } catch (err) {
    console.error("[cron] net worth snapshots не удались:", err);
  }

  return NextResponse.json({
    integrationsSynced: integrations.length + bankIntegrations.length,
    transactionsSynced,
    netWorthSnapshots,
    orgsChecked: orgs.length,
    alertsSent,
  });
}
