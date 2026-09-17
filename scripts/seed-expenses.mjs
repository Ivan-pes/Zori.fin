// Демо-расходы (source='manual') — представляют траты, которые позже придут
// автоматически из банка/бухгалтерии. Нужны, чтобы протестировать категоризацию.
// Запуск: node scripts/seed-expenses.mjs
import postgres from "postgres";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = envText.split("\n").find((l) => l.startsWith("DATABASE_URL="));
const sql = postgres(line.slice("DATABASE_URL=".length).trim(), { ssl: "require" });

// Разрешаем source='manual' (обновляем CHECK-ограничение).
await sql`alter table transactions drop constraint if exists transactions_source_check`;
await sql`alter table transactions add constraint transactions_source_check check (source in ('stripe','paypal','manual'))`;

const [org] = await sql`select id from organizations order by created_at asc limit 1`;
if (!org) {
  console.log("Нет организации");
  await sql.end();
  process.exit(1);
}

const samples = [
  { ext: "demo-exp-1", amount: 8000, desc: "Google Ads — рекламная кампания", at: "2026-06-05" },
  { ext: "demo-exp-2", amount: 5000, desc: "Notion + Figma подписки", at: "2026-06-07" },
  { ext: "demo-exp-3", amount: 4000, desc: "Оплата фрилансеру за дизайн лендинга", at: "2026-06-10" },
  { ext: "demo-exp-4", amount: 3000, desc: "Оплата ООО «Ромашка» по счёту 142", at: "2026-06-12" },
  { ext: "demo-exp-5", amount: 9000, desc: "Аренда коворкинга, июнь", at: "2026-06-01" },
];

for (const s of samples) {
  await sql`
    insert into transactions
      (org_id, source, external_id, kind, direction, gross_cents, fee_cents, net_cents, currency, occurred_at, description, category)
    values
      (${org.id}, 'manual', ${s.ext}, 'adjustment', 'expense', ${s.amount}, 0, ${-s.amount}, 'EUR', ${s.at}, ${s.desc}, null)
    on conflict (org_id, source, external_id) do nothing
  `;
}

const [{ n }] = await sql`
  select count(*)::int as n from transactions where org_id = ${org.id} and direction = 'expense'
`;
console.log(`Демо-расходов в базе (для первой организации): ${n}`);
await sql.end();
