import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getCurrentUserId } from "@/lib/session";
import { sql } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { yaxiEnabled } from "@/lib/env";

// userSecret для тихого автосинка YAXI: 32 случайных байта, которыми в БРАУЗЕРЕ
// пользователя шифруется доступ к банку (routex storeCredentials/loadCredentials).
// Здесь секрет живёт AES-зашифрованным (src/lib/crypto), привязанным к user.id;
// сам доступ к банку на сервер не попадает. Возвращаем только владельцу сессии.
//
// Разделение секрета: БД хранит ключ (без данных), браузер — данные (без ключа).
// Чтобы вскрыть доступ к банку, нужны ОБА + мастер-ключ TOKEN_ENCRYPTION_KEY (env).

export async function GET() {
  if (!yaxiEnabled) {
    return NextResponse.json({ error: "bank integration disabled" }, { status: 503 });
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [row] = await sql<{ yaxi_user_secret_enc: string | null }[]>`
    select yaxi_user_secret_enc from users where id = ${userId}
  `;
  if (!row) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let secretB64: string;
  if (row.yaxi_user_secret_enc) {
    secretB64 = decrypt(row.yaxi_user_secret_enc);
  } else {
    // Первое обращение — генерируем и сохраняем. base64: удобно передать на
    // фронт и превратить в Uint8Array для storeCredentials.
    secretB64 = randomBytes(32).toString("base64");
    await sql`
      update users set yaxi_user_secret_enc = ${encrypt(secretB64)} where id = ${userId}
    `;
  }

  return NextResponse.json({ userSecret: secretB64 });
}
