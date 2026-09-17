// Одноразовый бэкфилл: помечает всех СУЩЕСТВУЮЩИХ пользователей как
// подтверждённых, чтобы введение email-верификации не заблокировало их.
// Новые пользователи (после этого) проходят подтверждение как обычно.
// Запуск: node scripts/backfill-verified.mjs
import postgres from "postgres";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = envText.split("\n").find((l) => l.startsWith("DATABASE_URL="));
const sql = postgres(line.slice("DATABASE_URL=".length).trim(), { ssl: "require" });

const rows = await sql`
  update users set email_verified = now() where email_verified is null returning email
`;
console.log(`Подтверждено существующих пользователей: ${rows.length}`);
await sql.end();
