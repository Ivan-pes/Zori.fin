import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { verifyEmailCode } from "@/lib/twofa";

const schema = z.object({ code: z.string().min(6).max(8) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  if (!(await verifyEmailCode(session.user.email, parsed.data.code, "enable"))) {
    return NextResponse.json({ error: "Неверный или истёкший код." }, { status: 400 });
  }
  await sql`update users set twofa_method = 'email', twofa_secret = null where id = ${session.user.id}`;
  return NextResponse.json({ ok: true });
}
