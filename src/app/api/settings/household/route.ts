import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireOwnerOrg } from "@/lib/guard-write";
import { getAccountContext } from "@/lib/account/context";
import { getPersonalPlan } from "@/lib/billing/plan";
import { canP } from "@/lib/billing/entitlements.personal";

const schema = z.object({ household: z.boolean() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireOwnerOrg();
  if ("error" in guard) return guard.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  const ctx = await getAccountContext(orgId!);
  if (!ctx || ctx.type !== "personal") {
    return NextResponse.json({ error: "Household доступен только в личном пространстве" }, { status: 400 });
  }

  // Включение household — фича тарифа Plus.
  if (parsed.data.household && !canP(await getPersonalPlan(orgId!), "household")) {
    return NextResponse.json({ error: "householdRequiresPlus" }, { status: 403 });
  }

  await sql`update organizations set household = ${parsed.data.household} where id = ${orgId}`;
  return NextResponse.json({ ok: true });
}
