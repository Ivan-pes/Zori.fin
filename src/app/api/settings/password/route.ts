import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getUserByEmail } from "@/lib/users";
import { hashPassword, verifyPassword } from "@/lib/password";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Новый пароль — минимум 8 символов" }, { status: 400 });
  }

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }
  if (!user.passwordHash) {
    return NextResponse.json({ error: "Вход через Google — пароль не используется" }, { status: 400 });
  }

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Текущий пароль неверный" }, { status: 400 });
  }

  const hash = await hashPassword(parsed.data.newPassword);
  await sql`update users set password_hash = ${hash} where id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
