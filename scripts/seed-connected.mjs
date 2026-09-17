// Создаёт тестовые платежи на ПОДКЛЮЧЁННОМ через OAuth Stripe-аккаунте,
// чтобы на дашборде появились живые цифры. Запуск: node scripts/seed-connected.mjs
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
console.log(`Подключённый аккаунт: ${intg.acct} · организация: ${intg.org}`);

const samples = [
  { amount: 4900, desc: "Подписка Starter — клиент A" },
  { amount: 9900, desc: "Подписка Growth — клиент B" },
  { amount: 19900, desc: "Подписка Pro — клиент C" },
];

for (const s of samples) {
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: s.amount,
        currency: "eur",
        description: s.desc,
        payment_method: "pm_card_visa",
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { stripeAccount: intg.acct }
    );
    console.log(`  ✓ ${pi.id} · ${pi.status} · ${s.amount / 100}€`);
  } catch (e) {
    console.log(`  ✗ ${s.desc} — ${e.message}`);
  }
}

await sql.end();
