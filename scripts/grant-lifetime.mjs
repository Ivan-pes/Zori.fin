// Выдаёт (или снимает) БЕССРОЧНЫЙ доступ к тарифу — «подарок» без Stripe.
// Ставит subscriptions.comped = true: план активен всегда, Checkout закрыт,
// вебхук такую строку не трогает (см. src/lib/billing/plan.ts).
//
// Запуск:
//   node scripts/grant-lifetime.mjs <email> [--plan=pro] [--note="…"]
//   node scripts/grant-lifetime.mjs <email> --revoke
//   node scripts/grant-lifetime.mjs <email> --cancel-stripe   # + отменить подписку в Stripe
//
// --cancel-stripe отменяет платящую подписку клиента в Stripe и требует
// БОЕВОГО STRIPE_SECRET_KEY (в .env лежит тестовый — прод-ключ на Render).
// Без этого флага строка в БД просто перестаёт зависеть от Stripe, но
// списания у Stripe продолжатся, пока подписку не отменить руками.
import postgres from "postgres";
import { readFileSync } from "node:fs";

const envText = (() => {
  try {
    return readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return "";
  }
})();
const val = (k) => {
  if (process.env[k]) return process.env[k];
  const l = envText.split("\n").find((x) => x.startsWith(k + "="));
  return l ? l.slice(k.length + 1).trim() : "";
};

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const flag = (name, def = null) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return def;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};

if (!email) {
  console.error("Укажи email: node scripts/grant-lifetime.mjs <email> [--plan=pro] [--revoke] [--cancel-stripe]");
  process.exit(1);
}

const revoke = flag("revoke") === true;
const plan = String(flag("plan", "pro"));
const note = flag("note", revoke ? null : `выдан вручную ${new Date().toISOString().slice(0, 10)}`);
const cancelStripe = flag("cancel-stripe") === true;

if (!["starter", "growth", "pro", "plus"].includes(plan)) {
  console.error(`Неизвестный план: ${plan} (starter|growth|pro|plus)`);
  process.exit(1);
}

const dbUrl = val("DATABASE_URL");
if (!dbUrl) {
  console.error("DATABASE_URL не найден ни в окружении, ни в .env");
  process.exit(1);
}
const sql = postgres(dbUrl, { ssl: "require" });

try {
  // Колонки могут отсутствовать в старой базе — миграция идемпотентна.
  await sql`alter table subscriptions add column if not exists comped boolean not null default false`;
  await sql`alter table subscriptions add column if not exists comp_note text`;

  const users = await sql`select id, email from users where lower(email) = lower(${email})`;
  if (!users.length) {
    console.error(`Пользователь ${email} не найден`);
    process.exit(1);
  }
  const user = users[0];

  const orgs = await sql`
    select id, name, type from organizations where owner_id = ${user.id} order by created_at
  `;
  if (!orgs.length) {
    console.error(`У ${user.email} нет своих пространств`);
    process.exit(1);
  }

  for (const org of orgs) {
    if (revoke) {
      await sql`
        update subscriptions set comped = false, comp_note = null, status = 'canceled'
        where org_id = ${org.id}
      `;
      console.log(`  ✓ снят бессрочный доступ: ${org.name} (${org.type})`);
      continue;
    }

    const [before] = await sql`select stripe_customer_id from subscriptions where org_id = ${org.id}`;
    await sql`
      insert into subscriptions (org_id, plan, status, current_period_end, comped, comp_note)
      values (${org.id}, ${plan}, 'active', null, true, ${note})
      on conflict (org_id) do update
        set plan = excluded.plan, status = 'active', current_period_end = null,
            comped = true, comp_note = excluded.comp_note
    `;
    console.log(`  ✓ ${plan} бессрочно: ${org.name} (${org.type})`);

    if (cancelStripe && before?.stripe_customer_id) {
      const key = val("STRIPE_SECRET_KEY");
      if (!key) {
        console.log(`    ! STRIPE_SECRET_KEY не задан — подписка ${before.stripe_customer_id} не отменена`);
        continue;
      }
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(key);
      try {
        const subs = await stripe.subscriptions.list({ customer: before.stripe_customer_id, status: "active", limit: 10 });
        for (const s of subs.data) {
          await stripe.subscriptions.cancel(s.id);
          console.log(`    ✓ Stripe: подписка ${s.id} отменена`);
        }
        if (!subs.data.length) console.log("    • Stripe: активных подписок нет");
      } catch (e) {
        console.log(`    ! Stripe: ${e.message} (нужен боевой ключ того же аккаунта)`);
      }
    }
  }

  const rows = await sql`
    select o.name, s.plan, s.status, s.comped, s.comp_note, s.stripe_customer_id
    from subscriptions s join organizations o on o.id = s.org_id
    where o.owner_id = ${user.id}
  `;
  console.log("\nИтог:", JSON.stringify(rows, null, 2));
} catch (err) {
  console.error("✗ Ошибка:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
