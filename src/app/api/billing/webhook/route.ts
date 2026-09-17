import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { sql } from "@/lib/db";
import { markSubscriptionActive } from "@/lib/billing/plan";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook не настроен" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "нет подписи" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: `подпись: ${(err as Error).message}` }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const orgId = s.metadata?.orgId;
      const plan = s.metadata?.plan ?? null;
      const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
      if (orgId) await markSubscriptionActive(orgId, customerId, plan);
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
      if (orgId) {
        // comped = бессрочный доступ, выданный вручную: Stripe его не отменяет.
        await sql`
          update subscriptions set status = ${status}, current_period_end = ${periodEnd}
          where org_id = ${orgId} and comped = false
        `;
      }
    }
  } catch (err) {
    console.error("[billing webhook] обработка не удалась:", err);
  }

  return NextResponse.json({ received: true });
}
