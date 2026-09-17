import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { getAccountContext } from "@/lib/account/context";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { GoalsView } from "@/components/GoalsView";
import { AffordabilitySim } from "@/components/AffordabilitySim";
import { loadTransactions } from "@/lib/transactions";
import { getOrgPlan, getPersonalPlan } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { canP } from "@/lib/billing/entitlements.personal";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";

const DAY = 86_400_000;
const LOOKBACK = 90;

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const locale = await getLocale();
  const tr = translator(locale);

  const [org] = await sql<
    { id: string; name: string; current_balance_cents: string | null; safe_threshold_cents: string | null; base_currency: string | null }[]
  >`
    select id, name, current_balance_cents, safe_threshold_cents, base_currency
    from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const personal = (await getAccountContext(org.id))?.type === "personal";
  const { plan } = await getOrgPlan(org.id);
  const cur = org.base_currency ?? "EUR";
  const canEditGoals = plan !== "free";
  // Калькулятор «что могу себе позволить»: для личных пространств — по личной сетке
  // (Plus/Pro включают affordability), для бизнеса — по бизнес-фиче scenarioWhatIf (Growth+).
  const affordEnabled = personal
    ? canP(await getPersonalPlan(org.id), "affordability")
    : can(plan, "scenarioWhatIf");

  const goals = canEditGoals
    ? await sql<{ id: string; kind: string; title: string; target_cents: string; current_cents: string }[]>`
        select id, kind, title, target_cents, current_cents from goals where org_id = ${org.id} order by created_at asc
      `
    : [];

  const now = new Date();
  const recent = await loadTransactions(org.id, { from: new Date(now.getTime() - LOOKBACK * DAY), to: new Date(now.getTime() + DAY) });
  const sumNet = recent.reduce((s, t) => s + t.netCents, 0);
  const avgDailyNetCents = Math.round(sumNet / LOOKBACK);
  const monthlySavingsCents = Math.max(0, avgDailyNetCents * 30);
  const balanceCents = org.current_balance_cents === null ? 0 : Number(org.current_balance_cents);
  const thresholdCents = org.safe_threshold_cents === null ? 0 : Number(org.safe_threshold_cents);

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="goals" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{personal ? tr("pg.title") : tr("goal.pageTitle")}</h1>
            <div className="sub">{personal ? tr("pg.sub") : tr("goal.pageSub")}</div>
          </div>
          <div className="actions"><SignOutButton locale={locale} /></div>
        </div>

        {canEditGoals ? (
          <GoalsView initialGoals={goals} monthlySavingsCents={monthlySavingsCents} currency={cur} canEdit={canEditGoals} locale={locale} />
        ) : (
          <div className="note info" style={{ marginBottom: 16 }}>
            <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            <span>{tr("goal.starterGate")}</span>
          </div>
        )}

        <div className="panel">
          <div className="panel-head">
            <h3>{tr("goal.affordTitle")}</h3>
            <span className="mut">{tr("goal.affordSimNote")}</span>
          </div>
          {affordEnabled ? (
            <>
              <AffordabilitySim avgDailyNetCents={avgDailyNetCents} balanceCents={balanceCents} thresholdCents={thresholdCents} currency={cur} locale={locale} />
              <div className="note info">
                <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                <span>{tr("goal.affordNote")}</span>
              </div>
            </>
          ) : (
            <div className="note info">
              <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              <span>{personal ? tr("goal.affordGatePersonal") : tr("goal.affordGate")}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
