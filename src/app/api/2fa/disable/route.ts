import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/password";
import { decrypt } from "@/lib/crypto";
import { verifyTotp } from "@/lib/twofa";

const schema = z.object({ password: z.string().optional(), code: z.string().optional() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const password = parsed.success ? parsed.data.password ?? "" : "";
  const code = parsed.success ? parsed.data.code ?? "" : "";

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Аккаунт не найден" }, { status: 400 });

  let allowed = false;
  if (user.passwordHash && password && (await verifyPassword(password, user.passwordHash))) allowed = true;
  if (!allowed && code && user.twofaMethod === "totp" && user.twofaSecret) {
    allowed = verifyTotp(decrypt(user.twofaSecret), code);
  }
  if (!allowed && !user.passwordHash) allowed = true;

  if (!allowed) {
    return NextResponse.json(
      { error: "Подтвердите паролем или текущим кодом из приложения." },
      { status: 400 }
    );
  }

  await sql`update users set twofa_method = null, twofa_secret = null where id = ${session.user.id}`;
  return NextResponse.json({ ok: true });
}
