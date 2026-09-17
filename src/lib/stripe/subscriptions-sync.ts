import type Stripe from "stripe";
import { stripe } from "./client";
import { sql } from "../db";

export async function syncStripeSubscriptions(orgId: string, stripeAccountId: string): Promise<number> {
  let count = 0;
  const params: Stripe.SubscriptionListParams = {
    status: "all",
    limit: 100,
    expand: ["data.items.data.price"],
  };

  for await (const sub of stripe.subscriptions.list(params, { stripeAccount: stripeAccountId })) {
    const price = sub.items.data[0]?.price;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

    await sql`
      insert into stripe_subscriptions
        (id, org_id, customer_id, status, amount_cents, currency, interval, interval_count,
         product_name, current_period_end, canceled_at, started_at, synced_at)
      values
        (${sub.id}, ${orgId}, ${customerId}, ${sub.status}, ${price?.unit_amount ?? 0}, ${price?.currency ?? null},
         ${price?.recurring?.interval ?? null}, ${price?.recurring?.interval_count ?? 1}, ${price?.nickname ?? null},
         ${sub.current_period_end ? new Date(sub.current_period_end * 1000) : null},
         ${sub.canceled_at ? new Date(sub.canceled_at * 1000) : null},
         ${sub.created ? new Date(sub.created * 1000) : null}, now())
      on conflict (id) do update set
        status = excluded.status, amount_cents = excluded.amount_cents, currency = excluded.currency,
        interval = excluded.interval, interval_count = excluded.interval_count, product_name = excluded.product_name,
        current_period_end = excluded.current_period_end, canceled_at = excluded.canceled_at, synced_at = now()
    `;
    count++;
  }

  return count;
}
