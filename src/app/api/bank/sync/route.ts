import { NextResponse } from "next/server";
import { syncBankIntegration } from "@/lib/enablebanking/sync";
import { syncYapilyIntegration } from "@/lib/yapily/sync";
import { categorizeTransactions } from "@/lib/categorize/run";
import { decrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { bankEnabled } from "@/lib/env";
import { requireWritableOrg } from "@/lib/guard-write";

export async function POST() {
  if (!bankEnabled) {
    return NextResponse.json({ error: "bank integration disabled" }, { status: 503 });
  }
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const integrations = await sql<
    {
      external_account_id: string;
      access_token_enc: string | null;
      metadata: { provider?: string; accounts?: string[] };
    }[]
  >`
    select external_account_id, access_token_enc, metadata from integrations
    where org_id = ${orgId} and provider = 'gocardless' and status = 'active'
  `;

  let synced = 0;
  for (const intg of integrations) {
    try {
      // YAXI — клиентский флоу: серверного консента нет, синк идёт с фронта.
      if (intg.metadata?.provider === "yaxi") continue;
      if (intg.metadata?.provider === "yapily") {
        if (!intg.access_token_enc) continue;
        synced += await syncYapilyIntegration(
          orgId,
          intg.external_account_id,
          decrypt(intg.access_token_enc)
        );
      } else {
        synced += await syncBankIntegration(orgId, intg.external_account_id, intg.metadata);
      }
    } catch (err) {
      console.error("bank re-sync error:", err);
    }
  }
  await categorizeTransactions(orgId);

  return NextResponse.json({ integrations: integrations.length, synced });
}
