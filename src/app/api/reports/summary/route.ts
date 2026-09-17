import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { computeReportData, getCachedReportSummary, MAX_WEEKS_BACK } from "@/lib/reports/weekly";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const [org] = await sql<
    { id: string; name: string; current_balance_cents: string | null; safe_threshold_cents: string | null }[]
  >`
    select id, name, current_balance_cents, safe_threshold_cents from organizations
    where id = ${await getCurrentOrgId()}
  `;
  if (!org) {
    return NextResponse.json({ error: "no organization" }, { status: 400 });
  }

  const wRaw = parseInt(req.nextUrl.searchParams.get("week") ?? "0", 10);
  const week = Number.isFinite(wRaw) ? Math.min(Math.max(wRaw, 0), MAX_WEEKS_BACK) : 0;

  const data = await computeReportData(org, week);
  if (!data.hasActivity) {
    return NextResponse.json({ summary: null, generatedAt: null });
  }
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const { summary, generatedAt } = await getCachedReportSummary(org.id, week, data, { force });
  return NextResponse.json({ summary, generatedAt });
}
