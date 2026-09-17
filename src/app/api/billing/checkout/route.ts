import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireOwnerOrg } from "@/lib/guard-write";
import { stripe } from "@/lib/stripe/client";
import { isComped } from "@/lib/billing/plan";
import { env } from "@/lib/env";

const PRICE_BY_PLAN = {
  starter: () => env.STRIPE_PRICE_STARTER,
  growth: () => env.STRIPE_PRICE_GROWTH,
  pro: () => env.STRIPE_PRICE_PRO,
  plus: () => env.STRIPE_PRICE_PLUS,
} as const;
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const guard = await requireOwnerOrg();
  if ("error" in guard) return guard.error;

  const parsed = z.object({ plan: z.enum(["starter", "growth", "pro", "plus"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный план" }, { status: 400 });
  }

  const [org] = await sql<{ id: string }[]>`
    select id from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) {
    return NextResponse.json({ error: "no organization" }, { status: 400 });
  }

  // Бессрочный доступ — платить нечего, Checkout не открываем.
  if (await isComped(org.id)) {
    return NextResponse.json({ error: "У вас бессрочный доступ — оплата не нужна" }, { status: 400 });
  }

  const priceId = PRICE_BY_PLAN[parsed.data.plan]();
  if (!priceId) {
    return NextResponse.json({ error: "Биллинг ещё не настроен (нет Stripe price ID)" }, { status: 503 });
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: session.user.email,
    success_url: `${env.APP_URL}/app/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}/app/settings?billing=cancel`,
    metadata: { orgId: org.id, plan: parsed.data.plan },
    subscription_data: { metadata: { orgId: org.id, plan: parsed.data.plan } },
  });

  return NextResponse.json({ url: checkout.url });
}
