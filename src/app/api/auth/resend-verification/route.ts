import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/users";
import { sendVerificationEmail } from "@/lib/verification";
import { isActionLimited, recordAction, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const normalized = email?.toLowerCase().trim();
  if (normalized) {
    const key = `resend:${clientIp(req) ?? "unknown"}`;
    if (!(await isActionLimited(key, 5, 60))) {
      await recordAction(key, clientIp(req));
      const user = await getUserByEmail(normalized);
      if (user && !user.emailVerified) {
        await sendVerificationEmail(normalized);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
