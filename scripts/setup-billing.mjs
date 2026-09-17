// Создаёт продукты и цены ДЛЯ НАШЕЙ подписки (Zori Growth/Pro) на платформенном
// Stripe-аккаунте и печатает price ID для .env. Идемпотентно (по lookup_key).
// Запуск: node scripts/setup-billing.mjs
import Stripe from "stripe";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const val = (k) => {
  const l = envText.split("\n").find((x) => x.startsWith(k + "="));
  return l ? l.slice(k.length + 1).trim() : "";
};

const stripe = new Stripe(val("STRIPE_SECRET_KEY"));

const plans = [
  { key: "starter", name: "Zori Starter", amount: 4900 },
  { key: "growth", name: "Zori Growth", amount: 9900 },
  { key: "pro", name: "Zori Pro", amount: 19900 },
];

console.log("Настраиваю тарифы на платформенном Stripe (режим определяется ключом)…\n");

const out = [];
for (const p of plans) {
  const lookupKey = `zori_${p.key}_monthly`;
  let price;
  try {
    price = await stripe.prices.create({
      unit_amount: p.amount,
      currency: "eur",
      recurring: { interval: "month" },
      product_data: { name: p.name },
      lookup_key: lookupKey,
    });
    console.log(`  ✓ создан ${p.name}: ${price.id}`);
  } catch (e) {
    // Цена с таким lookup_key уже есть — берём существующую.
    const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    price = found.data[0];
    if (!price) throw e;
    console.log(`  • уже есть ${p.name}: ${price.id}`);
  }
  out.push(`STRIPE_PRICE_${p.key.toUpperCase()}=${price.id}`);
}

console.log("\n── Скопируй в .env ─────────────────────────────");
out.forEach((l) => console.log(l));
console.log("───────────────────────────────────────────────");
console.log("Затем перезапусти dev. Для локального вебхука: stripe listen --forward-to localhost:3000/api/billing/webhook");
