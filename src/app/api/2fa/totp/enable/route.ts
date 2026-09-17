import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { verifyTotp } from "@/lib/twofa";
import { env } from "@/lib/env";

const schema = z.object({ secret: z.string().min(16), code: z.string().min(6).max(8) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  if (!env.TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json(
      { error: "2FA не настроена на сервере: не задан TOKEN_ENCRYPTION_KEY. Добавьте его в переменные окружения." },
      { status: 503 }
    );
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  if (!verifyTotp(parsed.data.secret, parsed.data.code)) {
    return NextResponse.json(
      { error: "Неверный код. Проверьте время на телефоне и попробуйте снова." },
      { status: 400 }
    );
  }
  await sql`
    update users set twofa_method = 'totp', twofa_secret = ${encrypt(parsed.data.secret)}
    where id = ${session.user.id}
  `;
  return NextResponse.json({ ok: true });
}
