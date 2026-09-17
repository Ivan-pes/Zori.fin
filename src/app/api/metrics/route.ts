import { NextRequest, NextResponse } from "next/server";
import { getCurrentOrgId } from "@/lib/session";
import { loadTransactions } from "@/lib/transactions";
import { computePnL, expenseBreakdown } from "@/lib/metrics/engine";

export async function GET(req: NextRequest) {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const url = new URL(req.url);
  const now = new Date();

  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam
    ? new Date(fromParam)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = toParam
    ? new Date(toParam)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const txns = await loadTransactions(orgId, { from, to });

  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString() },
    pnl: computePnL(txns),
    expenseBreakdown: expenseBreakdown(txns),
    count: txns.length,
  });
}
