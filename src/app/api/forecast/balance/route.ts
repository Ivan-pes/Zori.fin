import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const { balanceCents, thresholdCents } = (await req.json().catch(() => ({}))) as {
    balanceCents?: number;
    thresholdCents?: number;
  };
  const bal = Math.round(Number(balanceCents));
  if (!Number.isFinite(bal) || bal < 0) {
    return NextResponse.json({ error: "Введите корректный остаток" }, { status: 400 });
  }
  const thrNum = Math.round(Number(thresholdCents));
  const thr = Number.isFinite(thrNum) && thrNum >= 0 ? thrNum : 0;

  await sql`
    update organizations set current_balance_cents = ${bal}, safe_threshold_cents = ${thr}
    where id = (
      select id from organizations where id = ${await getCurrentOrgId()}
    )
  `;
  return NextResponse.json({ ok: true });
}
