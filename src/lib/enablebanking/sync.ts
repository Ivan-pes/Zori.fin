import { ebFetch } from "./client";
import { sql } from "../db";

interface EbAmount {
  amount: string;
  currency: string;
}
interface EbTransaction {
  entry_reference?: string;
  transaction_amount: EbAmount;
  credit_debit_indicator?: "CRDT" | "DBIT";
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
}
interface EbBalance {
  balance_amount: EbAmount;
  balance_type?: string;
}

function describe(t: EbTransaction): string | null {
  const rem = t.remittance_information?.filter(Boolean).join(" ").trim();
  return rem || t.creditor?.name || t.debtor?.name || null;
}

function externalId(t: EbTransaction): string {
  if (t.entry_reference) return `eb:${t.entry_reference}`;
  const date = t.booking_date ?? t.value_date ?? t.transaction_date ?? "";
  return `eb:${date}:${t.transaction_amount.amount}:${(describe(t) ?? "").slice(0, 40)}`;
}

async function syncAccountTransactions(orgId: string, accountUid: string): Promise<number> {
  const dateFrom = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  let count = 0;
  let continuation: string | undefined;
  let pages = 0;

  do {
    const qs = new URLSearchParams({ date_from: dateFrom });
    if (continuation) qs.set("continuation_key", continuation);
    const data = await ebFetch<{ transactions: EbTransaction[]; continuation_key?: string }>(
      `/accounts/${accountUid}/transactions?${qs.toString()}`
    );
    const txns = data.transactions ?? [];

    for (const t of txns) {
      const amount = Number(t.transaction_amount?.amount);
      if (!Number.isFinite(amount)) continue;
      const magnitude = Math.round(Math.abs(amount) * 100);
      const income = t.credit_debit_indicator !== "DBIT";
      const signed = income ? magnitude : -magnitude;
      const occurredAt = new Date(t.booking_date ?? t.value_date ?? t.transaction_date ?? Date.now());

      await sql`
        insert into transactions
          (org_id, source, external_id, kind, direction,
           gross_cents, fee_cents, net_cents, currency, occurred_at, description, raw)
        values
          (${orgId}, 'gocardless', ${externalId(t)}, 'adjustment', ${income ? "income" : "expense"},
           ${magnitude}, 0, ${signed}, ${(t.transaction_amount.currency || "EUR").toUpperCase()},
           ${occurredAt}, ${describe(t)}, ${sql.json(JSON.parse(JSON.stringify(t)))})
        on conflict (org_id, source, external_id) do nothing
      `;
      count++;
    }

    continuation = data.continuation_key;
    pages++;
  } while (continuation && pages < 6);

  return count;
}

async function fetchAccountBalanceCents(accountUid: string): Promise<number | null> {
  try {
    const data = await ebFetch<{ balances: EbBalance[] }>(`/accounts/${accountUid}/balances`);
    const balances = data.balances ?? [];
    const pick =
      balances.find((b) => b.balance_type === "interimAvailable") ||
      balances.find((b) => b.balance_type === "closingBooked") ||
      balances[0];
    if (!pick) return null;
    const amount = Number(pick.balance_amount.amount);
    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
  } catch {
    return null;
  }
}

export async function syncBankAccounts(
  orgId: string,
  sessionId: string,
  accountUids: string[]
): Promise<number> {
  let count = 0;
  let totalBalanceCents = 0;
  let haveBalance = false;

  for (const uid of accountUids) {
    try {
      count += await syncAccountTransactions(orgId, uid);
      const bal = await fetchAccountBalanceCents(uid);
      if (bal !== null) {
        totalBalanceCents += bal;
        haveBalance = true;
      }
    } catch (err) {
      console.error(`[bank] синк счёта ${uid} не удался:`, err);
    }
  }

  if (haveBalance) {
    await sql`update organizations set current_balance_cents = ${totalBalanceCents} where id = ${orgId}`;
  }
  await sql`
    update integrations set last_synced_at = now()
    where org_id = ${orgId} and provider = 'gocardless' and external_account_id = ${sessionId}
  `;
  return count;
}

export async function syncBankIntegration(
  orgId: string,
  sessionId: string,
  metadata: { accounts?: string[] }
): Promise<number> {
  const accounts = metadata.accounts ?? [];
  if (accounts.length === 0) return 0;
  return syncBankAccounts(orgId, sessionId, accounts);
}
