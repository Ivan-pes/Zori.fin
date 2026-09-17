import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendPasswordReset } from "@/lib/password-reset";
import { isActionLimited, recordAction, clientIp } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (parsed.success) {
    const key = `pwreset:${clientIp(req) ?? "unknown"}`;
    if (!(await isActionLimited(key, 5, 60))) {
      await recordAction(key, clientIp(req));
      try {
        await sendPasswordReset(parsed.data.email);
      } catch (err) {
        console.error("[forgot] не удалось отправить письмо сброса:", err);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
