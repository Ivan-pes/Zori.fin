import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { loadTransactions } from "@/lib/transactions";
import { forecastCashFlow } from "@/lib/metrics/forecast";
import { loadPlannedItems } from "@/lib/planned/load";
import { expandPlanned } from "@/lib/metrics/planned";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const [org] = await sql<
    { id: string; current_balance_cents: string | null; safe_threshold_cents: string | null }[]
  >`
    select id, current_balance_cents, safe_threshold_cents from organizations
    where id = ${await getCurrentOrgId()}
  `;
  if (!org) {
    return NextResponse.json({ error: "no organization" }, { status: 400 });
  }
  if (org.current_balance_cents === null) {
    return NextResponse.json({ needsBalance: true });
  }

  const horizonDays = req.nextUrl.searchParams.get("horizon") === "90" ? 90 : 30;
  const thresholdCents = org.safe_threshold_cents === null ? 0 : Number(org.safe_threshold_cents);

  const scenarios = await sql<{ id: string; name: string; assumptions: Record<string, number> }[]>`
    select id, name, assumptions from cashflow_scenarios where org_id = ${org.id} order by created_at asc
  `;
  const scenarioId = req.nextUrl.searchParams.get("scenario");
  const active = scenarioId ? scenarios.find((s) => s.id === scenarioId) : null;
  const activeAssumptions =
    active && typeof active.assumptions === "string"
      ? (JSON.parse(active.assumptions) as Record<string, number>)
      : active?.assumptions;

  const now = new Date();
  const lookbackDays = 30;
  const from = new Date(now.getTime() - lookbackDays * 86_400_000);
  const to = new Date(now.getTime() + 86_400_000);
  const txns = await loadTransactions(org.id, { from, to });

  // Плановые операции — в прогноз (график их видит).
  const horizonEnd = new Date(now.getTime() + (horizonDays + 1) * 86_400_000);
  const plannedOcc = expandPlanned(await loadPlannedItems(org.id), now, horizonEnd);
  const plannedByDate: Record<string, number> = {};
  let plannedNetCents = 0;
  for (const o of plannedOcc) {
    const signed = o.direction === "income" ? o.amountCents : -o.amountCents;
    plannedByDate[o.day] = (plannedByDate[o.day] ?? 0) + signed;
    plannedNetCents += signed;
  }

  // Ручные подписки (личный режим без банка) — тоже будущие списания.
  const manualSubs = await sql<{ amount_cents: string; cadence: string; next_due: Date | null }[]>`
    select amount_cents, cadence, next_due from manual_subscriptions where org_id = ${org.id}
  `;
  let manualSubsCents = 0;
  for (const m of manualSubs) {
    if (!m.next_due) continue;
    const stepMs = (m.cadence === "weekly" ? 7 : 30) * 86_400_000;
    let due = new Date(m.next_due).getTime();
    while (due < now.getTime()) due += stepMs; // догоняем до «сейчас»
    for (; due <= horizonEnd.getTime(); due += stepMs) {
      const day = new Date(due).toISOString().slice(0, 10);
      plannedByDate[day] = (plannedByDate[day] ?? 0) - Number(m.amount_cents);
      manualSubsCents += Number(m.amount_cents);
    }
  }

  const forecast = forecastCashFlow(txns, Number(org.current_balance_cents), {
    horizonDays,
    thresholdCents,
    lookbackDays,
    plannedByDate,
    scenario: activeAssumptions
      ? {
          monthlyDeltaCents: Number(activeAssumptions.monthlyDeltaCents ?? 0),
          oneOffCents: Number(activeAssumptions.oneOffCents ?? 0),
        }
      : undefined,
  });

  return NextResponse.json({
    balanceCents: Number(org.current_balance_cents),
    thresholdCents,
    forecast,
    scenarios,
    activeScenarioId: active?.id ?? null,
    // «Что влияет на прогноз» — прозрачные входы модели для настройки пользователем.
    factors: {
      startingBalanceCents: Number(org.current_balance_cents),
      avgDailyNetCents: forecast.avgDailyNetCents,
      lookbackDays,
      daysWithActivity: forecast.daysWithActivity,
      plannedNetCents,
      manualSubsCents,
      thresholdCents,
    },
  });
}
