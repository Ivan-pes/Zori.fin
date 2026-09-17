// Удаляет «шумные» fee-записи (application_fee с чужих тестовых аккаунтов),
// которые синк подтянул из аккаунта платформы. Они не относятся к P&L бизнеса.
// Запуск: node scripts/db-clean-fees.mjs
import postgres from "postgres";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = envText.split("\n").find((l) => l.startsWith("DATABASE_URL="));
const sql = postgres(line.slice("DATABASE_URL=".length).trim(), { ssl: "require" });

const deleted = await sql`delete from transactions where kind = 'fee' returning id`;
console.log(`Удалено fee-записей: ${deleted.length}`);

const [{ n }] = await sql`select count(*)::int as n from transactions`;
console.log(`Осталось транзакций: ${n}`);

await sql.end();
