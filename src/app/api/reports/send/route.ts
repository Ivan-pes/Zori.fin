import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { getOrgPlan } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { sendReportForWeek, MAX_WEEKS_BACK, type ReportOrgRow } from "@/lib/reports/weekly";

const schema = z.object({ week: z.number().int().min(0).max(MAX_WEEKS_BACK).optional() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const [org] = await sql<
    { id: string; name: string; current_balance_cents: string | null; safe_threshold_cents: string | null }[]
  >`
    select id, name, current_balance_cents, safe_threshold_cents from organizations
    where id = ${await getCurrentOrgId()}
  `;
  if (!org) return NextResponse.json({ error: "no organization" }, { status: 400 });

  const { plan } = await getOrgPlan(org.id);
  if (!can(plan, "weeklyReports")) {
    return NextResponse.json({ error: "Отчёты на почту доступны на тарифе Growth и выше" }, { status: 403 });
  }

  const email = session.user.email;
  if (!email) return NextResponse.json({ error: "У аккаунта нет email" }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const week = parsed.success ? parsed.data.week ?? 0 : 0;

  const row: ReportOrgRow = { ...org, owner_email: email };
  try {
    await sendReportForWeek(row, week);
  } catch (err) {
    console.error("[reports/send] не удалось отправить:", err);
    return NextResponse.json({ error: "Не удалось отправить письмо. Попробуйте позже." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to: email });
}
