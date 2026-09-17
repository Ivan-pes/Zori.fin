import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId, getCurrentMembership } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { TeamPanel } from "@/components/TeamPanel";
import { getOrgPlan, getPersonalPlan } from "@/lib/billing/plan";
import { limit } from "@/lib/billing/entitlements";
import { limitP } from "@/lib/billing/entitlements.personal";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";

// Семья (личное) / Команда (бизнес) — отдельная страница, пункт в навигации.
export default async function TeamPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const uiLocale = await getLocale();
  const tr = translator(uiLocale);

  const [org] = await sql<{ id: string; name: string; type: string | null; household: boolean | null }[]>`
    select id, name, type, household from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const isPersonal = org.type === "personal";
  const { plan: currentPlan } = await getOrgPlan(org.id);
  const personalPlan = isPersonal ? await getPersonalPlan(org.id) : "free_personal";
  const teamSeats = isPersonal
    ? 1 + limitP(personalPlan, "householdMembers")
    : limit(currentPlan, "teamSeats");

  const members = await sql<{ id: string; email: string; role: string; status: string; label: string | null }[]>`
    select id, email, role, status, label from memberships
    where org_id = ${org.id} and status != 'revoked' order by created_at asc
  `;
  const isOwner = (await getCurrentMembership())?.role === "owner";

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="team" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{isPersonal ? tr("nav.family") : tr("set.tab.team")}</h1>
            <div className="sub">{isPersonal ? tr("team.pageSubFam") : tr("team.pageSubBiz")} · {org.name}</div>
          </div>
          <div className="actions"><SignOutButton locale={uiLocale} /></div>
        </div>

        <TeamPanel
          ownerEmail={session.user.email ?? ""}
          members={members}
          teamSeats={teamSeats}
          isOwner={isOwner}
          accountType={isPersonal ? "personal" : "business"}
          personalPlan={personalPlan}
          household={org.household === true}
          uiLocale={uiLocale}
        />
      </main>
    </div>
  );
}
