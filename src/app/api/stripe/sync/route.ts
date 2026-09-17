import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { syncStripeTransactions } from "@/lib/stripe/sync";
import { syncStripeSubscriptions } from "@/lib/stripe/subscriptions-sync";
import { categorizeTransactions } from "@/lib/categorize/run";

export async function POST() {
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const [intg] = await sql<{ external_account_id: string }[]>`
    select external_account_id from integrations
    where org_id = ${orgId} and provider = 'stripe' and status = 'active'
    order by created_at desc limit 1
  `;
  if (!intg) {
    return NextResponse.json({ error: "Stripe не подключён" }, { status: 400 });
  }

  const synced = await syncStripeTransactions(orgId, intg.external_account_id, {
    limit: 100,
  });
  try {
    await categorizeTransactions(orgId);
  } catch (err) {
    console.error("Категоризация после синка не удалась:", err);
  }

  let syncedSubscriptions = 0;
  try {
    syncedSubscriptions = await syncStripeSubscriptions(orgId, intg.external_account_id);
  } catch (err) {
    console.error("Синк подписок не удался:", err);
  }

  return NextResponse.json({ syncedTransactions: synced, syncedSubscriptions });
}
