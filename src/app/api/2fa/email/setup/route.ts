import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { issueEmailCode, sendEmailCode } from "@/lib/twofa";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const code = await issueEmailCode(session.user.email, "enable");
  try {
    await sendEmailCode(session.user.email, code, "enable");
  } catch (err) {
    console.error("[2fa/email/setup] не удалось отправить код:", err);
    return NextResponse.json({ error: "Не удалось отправить код на почту." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
