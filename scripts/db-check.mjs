// Быстрый просмотр содержимого таблицы transactions. Запуск: node scripts/db-check.mjs
import postgres from "postgres";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = envText.split("\n").find((l) => l.startsWith("DATABASE_URL="));
const sql = postgres(line.slice("DATABASE_URL=".length).trim(), { ssl: "require" });

const rows = await sql`
  select occurred_at, kind, direction, gross_cents, fee_cents, currency, description
  from transactions
  order by occurred_at desc
  limit 20
`;
console.log("Транзакций:", rows.length);
for (const r of rows) {
  console.log(
    r.occurred_at.toISOString(),
    r.kind,
    r.direction,
    `${r.gross_cents}¢ fee=${r.fee_cents}¢`,
    r.currency,
    "—",
    r.description
  );
}
await sql.end();
