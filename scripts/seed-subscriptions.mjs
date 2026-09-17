// Создаёт тестовые ПОДПИСКИ на подключённом через OAuth Stripe-аккаунте,
// чтобы появились реальные SaaS-метрики (MRR/клиенты/отток/LTV).
// Запуск: node scripts/seed-subscriptions.mjs
import Stripe from "stripe";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const val = (k) => {
  const l = envText.split("\n").find((x) => x.startsWith(k + "="));
  return l.slice(k.length + 1).trim();
};

const sql = postgres(val("DATABASE_URL"), { ssl: "require" });
const stripe = new Stripe(val("STRIPE_SECRET_KEY"));

const [intg] = await sql`
  select i.external_account_id as acct, o.name as org
  from integrations i join organizations o on o.id = i.org_id
  where i.provider = 'stripe' and i.status = 'active'
  order by i.created_at desc limit 1
`;
if (!intg) {
  console.log("Нет подключённого Stripe-аккаунта в базе.");
  await sql.end();
  process.exit(1);
}
const acct = intg.acct;
console.log(`Подключённый аккаунт: ${acct} · организация: ${intg.org}`);

const plans = [
  { name: "Starter", amount: 4900, client: "Клиент A" },
  { name: "Growth", amount: 9900, client: "Клиент B" },
  { name: "Pro", amount: 19900, client: "Клиент C" },
];

for (const p of plans) {
  try {
    const price = await stripe.prices.create(
      { unit_amount: p.amount, currency: "eur", recurring: { interval: "month" }, product_data: { name: `Zori ${p.name}` } },
      { stripeAccount: acct }
    );
    const customer = await stripe.customers.create(
      { name: p.client, payment_method: "pm_card_visa", invoice_settings: { default_payment_method: "pm_card_visa" } },
      { stripeAccount: acct }
    );
    const sub = await stripe.subscriptions.create(
      { customer: customer.id, items: [{ price: price.id }] },
      { stripeAccount: acct }
    );
    console.log(`  ✓ ${p.name} · ${sub.status} · ${p.amount / 100}€/мес · ${sub.id}`);
  } catch (e) {
    console.log(`  ✗ ${p.name} — ${e.message}`);
  }
}

await sql.end();
console.log("\nГотово. Нажми «Обновить данные» в приложении (или дождись cron) — метрики станут реальными.");
