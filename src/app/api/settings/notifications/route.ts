import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";

const schema = z.object({
  reportFrequency: z.enum(["off", "daily", "weekly", "monthly"]).optional(),
  gap: z.boolean(),
  payment: z.boolean(),
  churn: z.boolean(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные настройки" }, { status: 400 });
  }
  await sql`
    update organizations set notification_prefs = ${sql.json(parsed.data)}
    where id = (
      select id from organizations where id = ${await getCurrentOrgId()}
    )
  `;
  return NextResponse.json({ ok: true });
}
