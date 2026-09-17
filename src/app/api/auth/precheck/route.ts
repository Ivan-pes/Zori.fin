import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/password";
import { isRateLimited } from "@/lib/rate-limit";
import { issueEmailCode, sendEmailCode } from "@/lib/twofa";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false });

  const email = parsed.data.email.toLowerCase().trim();
  if (await isRateLimited(email)) return NextResponse.json({ ok: false, limited: true });

  const user = await getUserByEmail(email);
  const ok = user?.passwordHash ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) return NextResponse.json({ ok: false });

  if (!user.emailVerified) return NextResponse.json({ ok: false, needsVerification: true });

  if (user.twofaMethod === "email") {
    const code = await issueEmailCode(email, "login");
    try {
      await sendEmailCode(email, code, "login");
    } catch (err) {
      console.error("[precheck] не удалось отправить код входа:", err);
    }
  }

  return NextResponse.json({ ok: true, twofa: user.twofaMethod ?? "none" });
}
