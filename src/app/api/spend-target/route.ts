import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { requireWritableOrg } from "@/lib/guard-write";

const schema = z.object({
  pct: z.number().int().min(10).max(100).nullable(), // null = вернуть автоформулу
});

/** «Тратить не больше N% дохода» — личный план трат (питает safe-to-spend). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный процент" }, { status: 400 });

  await sql`update organizations set spend_target_pct = ${parsed.data.pct} where id = ${guard.orgId}`;
  return NextResponse.json({ ok: true });
}
