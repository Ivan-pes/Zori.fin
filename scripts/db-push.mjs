// Применяет db/schema.sql к базе из DATABASE_URL и создаёт одну
// тестовую организацию (если её ещё нет). Запуск: npm run db:push
//
// DATABASE_URL читаем прямо из .env, чтобы не зависеть от того, как
// запущен скрипт (npm не пробрасывает .env в окружение автоматически).

import postgres from "postgres";
import { readFileSync } from "node:fs";

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = envText.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL не найден ни в окружении, ни в .env");
  return line.slice("DATABASE_URL=".length).trim();
}

const sql = postgres(readDatabaseUrl(), { ssl: "require" });

try {
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  await sql.unsafe(schema);
  console.log("✓ Схема применена (таблицы созданы)");

  await sql`
    insert into organizations (owner_id, name)
    select gen_random_uuid(), 'Demo'
    where not exists (select 1 from organizations)
  `;

  const orgs = await sql`select id, name from organizations`;
  console.log("✓ Организации в базе:", orgs);
} catch (err) {
  console.error("✗ Ошибка:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
