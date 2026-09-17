// Привязывает демо-данные (организацию Demo с транзакциями) к тестовому
// аккаунту test@zori.app, чтобы при входе сразу был виден дашборд с цифрами.
// Запуск: node scripts/setup-test-data.mjs
import postgres from "postgres";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = envText.split("\n").find((l) => l.startsWith("DATABASE_URL="));
const sql = postgres(line.slice("DATABASE_URL=".length).trim(), { ssl: "require" });

const [user] = await sql`select id from users where email = 'test@zori.app'`;
if (!user) {
  console.log("Нет пользователя test@zori.app — сначала зарегистрируй его.");
  await sql.end();
  process.exit(1);
}

const [demo] = await sql`select id from organizations where name = 'Demo'`;
if (demo) {
  await sql`update organizations set owner_id = ${user.id} where id = ${demo.id}`;
  console.log("✓ Demo-организация с данными привязана к test@zori.app");
}

const del = await sql`
  delete from organizations
  where owner_id = ${user.id} and name = 'Мой бизнес'
  returning id
`;
console.log(`✓ Удалено пустых организаций: ${del.length}`);

const orgs = await sql`
  select o.name, count(t.id)::int as txns
  from organizations o
  left join transactions t on t.org_id = o.id
  where o.owner_id = ${user.id}
  group by o.name
`;
console.log("Организации test@zori.app:", orgs);

await sql.end();
