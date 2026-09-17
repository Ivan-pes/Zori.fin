import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { consumeResetToken } from "@/lib/password-reset";
import { clearAttempts } from "@/lib/rate-limit";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов"),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
  }

  const email = await consumeResetToken(parsed.data.token);
  if (!email) {
    return NextResponse.json({ error: "Ссылка недействительна или истекла. Запросите сброс заново." }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await sql`
    update users
    set password_hash = ${passwordHash},
        email_verified = coalesce(email_verified, now())
    where email = ${email}
  `;
  await clearAttempts(email);

  return NextResponse.json({ ok: true });
}
