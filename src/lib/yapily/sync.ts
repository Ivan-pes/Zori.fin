import { ypFetch } from "./client";
import { sql } from "../db";

interface YpAmount {
  amount?: number;
  currency?: string;
}

interface YpTransaction {
  id?: string;
  date?: string;
  bookingDateTime?: string;
  valueDateTime?: string;
  amount?: number;
  currency?: string;
  transactionAmount?: YpAmount;
  description?: string;
  reference?: string;
  transactionInformation?: string[];
}

interface YpAccount {
  id: string;
  balance?: number;
  currency?: string;
}

function describe(t: YpTransaction): string | null {
  return (
    t.description ||
    t.transactionInformation?.join(" ") ||
    t.reference ||
    null
  );
}

function externalId(t: YpTransaction): string {
  if (t.id) return t.id;
  const date = t.date ?? t.bookingDateTime ?? "";
  return `yp:${date}:${t.amount}:${(describe(t) ?? "").slice(0, 40)}`;
}

async function syncAccountTransactions(
  orgId: string,
  consent: string,
  accountId: string
): Promise<number> {
  let page = await ypFetch<{ data?: YpTransaction[]; links?: { next?: string } }>(
    `/accounts/${encodeURIComponent(accountId)}/transactions?limit=200`,
    {},
    consent
  );
  let count = 0;

  // Пагинация по links.next, разумный потолок — 10 страниц (2000 операций).
  for (let i = 0; i < 10; i++) {
    for (const t of page.data ?? []) {
      const amount = t.transactionAmount?.amount ?? t.amount;
      if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
      const cents = Math.round(amount * 100);
      const currency = (t.transactionAmount?.currency ?? t.currency ?? "EUR").toUpperCase();
      const direction = cents >= 0 ? "income" : "expense";
      const occurredAt = new Date(t.date ?? t.bookingDateTime ?? t.valueDateTime ?? Date.now());

      // source='gocardless' — общий маркер «банк» (CHECK в схеме); настоящий
      // провайдер лежит в raw и в metadata интеграции.
      await sql`
        insert into transactions
          (org_id, source, external_id, kind, direction,
           gross_cents, fee_cents, net_cents, currency, occurred_at, description, raw)
        values
          (${orgId}, 'gocardless', ${externalId(t)}, 'adjustment', ${direction},
           ${Math.abs(cents)}, 0, ${cents}, ${currency},
           ${occurredAt}, ${describe(t)}, ${sql.json(JSON.parse(JSON.stringify(t)))})
        on conflict (org_id, source, external_id) do nothing
      `;
      count++;
    }
    const next = page.links?.next;
    if (!next) break;
    page = await ypFetch(next, {}, consent);
  }

  return count;
}

export async function syncYapilyIntegration(
  orgId: string,
  authRequestId: string,
  consent: string
): Promise<number> {
  const accountsRes = await ypFetch<{ data?: YpAccount[] }>(`/accounts`, {}, consent);
  const accounts = accountsRes.data ?? [];

  let count = 0;
  let totalBalanceCents = 0;
  let haveBalance = false;

  for (const a of accounts) {
    try {
      count += await syncAccountTransactions(orgId, consent, a.id);
      if (typeof a.balance === "number" && Number.isFinite(a.balance)) {
        totalBalanceCents += Math.round(a.balance * 100);
        haveBalance = true;
      }
    } catch (err) {
      console.error(`[yapily] синк счёта ${a.id} не удался:`, err);
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
      and external_account_id = ${authRequestId}
  `;

  return count;
}
