import { gcFetch } from "./client";
import { sql } from "../db";

interface GcAmount {
  amount: string;
  currency: string;
}

interface GcTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: GcAmount;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  creditorName?: string;
  debtorName?: string;
}

interface GcBalance {
  balanceAmount: GcAmount;
  balanceType: string;
}

function describe(t: GcTransaction): string | null {
  return (
    t.remittanceInformationUnstructured ||
    t.remittanceInformationUnstructuredArray?.join(" ") ||
    t.creditorName ||
    t.debtorName ||
    null
  );
}

function externalId(t: GcTransaction): string {
  if (t.transactionId) return t.transactionId;
  if (t.internalTransactionId) return t.internalTransactionId;
  const date = t.bookingDate ?? t.valueDate ?? "";
  return `gc:${date}:${t.transactionAmount.amount}:${(describe(t) ?? "").slice(0, 40)}`;
}

async function syncAccountTransactions(
  orgId: string,
  accountId: string
): Promise<number> {
  const data = await gcFetch<{
    transactions: { booked: GcTransaction[]; pending?: GcTransaction[] };
  }>(`/accounts/${accountId}/transactions/`);

  const booked = data.transactions?.booked ?? [];
  let count = 0;

  for (const t of booked) {
    const amount = Number(t.transactionAmount.amount);
    if (!Number.isFinite(amount)) continue;
    const cents = Math.round(amount * 100);
    const direction = cents >= 0 ? "income" : "expense";
    const occurredAt = new Date(t.bookingDate ?? t.valueDate ?? Date.now());

    await sql`
      insert into transactions
        (org_id, source, external_id, kind, direction,
         gross_cents, fee_cents, net_cents, currency, occurred_at, description, raw)
      values
        (${orgId}, 'gocardless', ${externalId(t)}, 'adjustment', ${direction},
         ${Math.abs(cents)}, 0, ${cents}, ${t.transactionAmount.currency.toUpperCase()},
         ${occurredAt}, ${describe(t)}, ${sql.json(JSON.parse(JSON.stringify(t)))})
      on conflict (org_id, source, external_id) do nothing
    `;
    count++;
  }

  return count;
}

async function fetchAccountBalanceCents(accountId: string): Promise<number | null> {
  const data = await gcFetch<{ balances: GcBalance[] }>(
    `/accounts/${accountId}/balances/`
  );
  const balances = data.balances ?? [];
  const pick =
    balances.find((b) => b.balanceType === "interimAvailable") ||
    balances.find((b) => b.balanceType === "closingBooked") ||
    balances[0];
  if (!pick) return null;
  const amount = Number(pick.balanceAmount.amount);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export async function syncBankAccounts(
  orgId: string,
  requisitionId: string,
  accounts: string[]
): Promise<number> {
  let count = 0;
  let totalBalanceCents = 0;
  let haveBalance = false;

  for (const accountId of accounts) {
    try {
      count += await syncAccountTransactions(orgId, accountId);
      const bal = await fetchAccountBalanceCents(accountId);
      if (bal !== null) {
        totalBalanceCents += bal;
        haveBalance = true;
      }
    } catch (err) {
      console.error(`[bank] синк счёта ${accountId} не удался:`, err);
    }
  }

  if (haveBalance) {
    await sql`
      update organizations set current_balance_cents = ${totalBalanceCents}
      where id = ${orgId}
    `;
  }

  await sql`
    update integrations set last_synced_at = now()
    where org_id = ${orgId} and provider = 'gocardless'
      and external_account_id = ${requisitionId}
  `;

  return count;
}

export async function syncBankIntegration(
  orgId: string,
  requisitionId: string,
  metadata: { accounts?: string[] }
): Promise<number> {
  const accounts = metadata.accounts ?? [];
  if (accounts.length === 0) return 0;
  return syncBankAccounts(orgId, requisitionId, accounts);
}
