import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireOwnerOrg } from "@/lib/guard-write";

const schema = z.object({ type: z.enum(["business", "personal"]) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const guard = await requireOwnerOrg();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный тип пространства" }, { status: 400 });
  }

  await sql`
    update organizations set type = ${parsed.data.type}
    where id = ${await getCurrentOrgId()}
  `;
  return NextResponse.json({ ok: true });
}
