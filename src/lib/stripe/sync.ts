import type Stripe from "stripe";
import { stripe } from "./client";
import { sql } from "../db";
import type { Direction, NormalizedTransaction, TransactionKind } from "@/types";

function mapType(bt: Stripe.BalanceTransaction): {
  kind: TransactionKind;
  direction: Direction;
} {
  switch (bt.type) {
    case "charge":
    case "payment":
      return { kind: "charge", direction: "income" };
    case "refund":
    case "payment_refund":
      return { kind: "refund", direction: "expense" };
    case "payout":
      return { kind: "payout", direction: "expense" };
    case "stripe_fee":
    case "application_fee":
      return { kind: "fee", direction: "expense" };
    default:
      return {
        kind: "adjustment",
        direction: bt.amount >= 0 ? "income" : "expense",
      };
  }
}

function normalize(
  bt: Stripe.BalanceTransaction
): Omit<NormalizedTransaction, "id"> {
  const { kind, direction } = mapType(bt);
  return {
    source: "stripe",
    externalId: bt.id,
    kind,
    direction,
    grossCents: Math.abs(bt.amount),
    feeCents: bt.fee,
    netCents: bt.net,
    currency: bt.currency.toUpperCase(),
    occurredAt: new Date(bt.created * 1000),
    description: bt.description,
    category: null,
  };
}

export async function syncStripeTransactions(
  orgId: string,
  stripeAccountId: string | null = null,
  opts: { limit?: number } = {}
): Promise<number> {
  let count = 0;
  const params: Stripe.BalanceTransactionListParams = {
    limit: opts.limit ?? 100,
  };

  const requestOpts = stripeAccountId
    ? { stripeAccount: stripeAccountId }
    : undefined;

  for await (const bt of stripe.balanceTransactions.list(params, requestOpts)) {
    const t = normalize(bt);
    await sql`
      insert into transactions
        (org_id, source, external_id, kind, direction,
         gross_cents, fee_cents, net_cents, currency, occurred_at, description, raw)
      values
        (${orgId}, ${t.source}, ${t.externalId}, ${t.kind}, ${t.direction},
         ${t.grossCents}, ${t.feeCents}, ${t.netCents}, ${t.currency},
         ${t.occurredAt}, ${t.description}, ${sql.json(JSON.parse(JSON.stringify(bt)))})
      on conflict (org_id, source, external_id) do nothing
    `;
    count++;
  }

  if (stripeAccountId) {
    await sql`
      update integrations set last_synced_at = now()
      where org_id = ${orgId} and provider = 'stripe'
        and external_account_id = ${stripeAccountId}
    `;
  }

  return count;
}
