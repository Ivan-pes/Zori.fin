// Диагностика: что реально лежит в тестовом Stripe. Запуск: node scripts/stripe-check.mjs
import Stripe from "stripe";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
function val(key) {
  const l = envText.split("\n").find((x) => x.startsWith(key + "="));
  return l?.slice(key.length + 1).trim();
}

const stripe = new Stripe(val("STRIPE_SECRET_KEY"));

const pis = await stripe.paymentIntents.list({ limit: 5 });
console.log("PaymentIntents:");
for (const p of pis.data) {
  console.log(`  ${p.id} status=${p.status} amount=${p.amount} latest_charge=${p.latest_charge}`);
}

const charges = await stripe.charges.list({ limit: 5 });
console.log("Charges:");
for (const c of charges.data) {
  console.log(`  ${c.id} status=${c.status} paid=${c.paid} amount=${c.amount} bt=${c.balance_transaction}`);
}

const bts = await stripe.balanceTransactions.list({ limit: 10 });
console.log("BalanceTransactions:");
for (const b of bts.data) {
  console.log(`  ${b.id} type=${b.type} amount=${b.amount} ${new Date(b.created * 1000).toISOString()}`);
}
