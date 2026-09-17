import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireWritableOrg } from "@/lib/guard-write";
import { recategorizeByRules } from "@/lib/categorize/run";

/** Пересчитать категории правилами (без AI). Ручные правки не трогаем. */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const result = await recategorizeByRules(guard.orgId);
  return NextResponse.json({ ok: true, ...result });
}
