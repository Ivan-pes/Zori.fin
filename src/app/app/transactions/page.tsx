import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { TransactionsView } from "@/components/TransactionsView";
import { MonthCoverage } from "@/components/MonthCoverage";
import { getOrgPlan } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { getAccountContext } from "@/lib/account/context";
import { isValidMemberLabel } from "@/lib/team-labels";
import { getCategoriesFor } from "@/lib/categorize/custom";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const [org] = await sql<{ id: string; name: string; owner_id: string }[]>`
    select id, name, owner_id from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const { plan } = await getOrgPlan(org.id);
  const locale = await getLocale();
  const tr = translator(locale);

  // Household: список участников для атрибуции «кто платил».
  const acct = await getAccountContext(org.id);
  const household = acct?.type === "personal" && acct.household;
  let members: { id: string; label: string }[] = [];
  if (household) {
    const rows = await sql<{ user_id: string | null; email: string; label: string | null }[]>`
      select u.id as user_id, u.email, null as label from users u where u.id = ${org.owner_id}
      union
      select m.user_id, m.email, m.label from memberships m
      where m.org_id = ${org.id} and m.status = 'active' and m.user_id is not null
    `;
    // Подпись участника («Сын», «Жена»…) читабельнее email в колонке «кто платил».
    members = rows
      .filter((r) => r.user_id)
      .map((r) => ({
        id: r.user_id!,
        label:
          r.user_id === session.user!.id
            ? tr("who.me")
            : r.label && isValidMemberLabel(r.label, true)
              ? tr(`mem.${r.label}`)
              : r.email,
      }));
  }

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="transactions" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nav.transactions")}</h1>
            <div className="sub">{tr("tx.sub")} · {org.name}</div>
          </div>
          <div className="actions">
            <a className="btn btn-dark btn-sm" href="/app/scan">{tr("tx.addReceipt")}</a>
            {plan === "free" ? (
              <button className="btn btn-line btn-sm" disabled title={tr("tx.exportStarter")}>{tr("tx.exportCsv")}</button>
            ) : (
              <a className="btn btn-line btn-sm" href="/api/reports/export?format=csv">{tr("tx.exportCsv")}</a>
            )}
            {can(plan, "exportExcel") && (
              <a className="btn btn-line btn-sm" href="/api/reports/export?format=xlsx">{tr("tx.exportExcel")}</a>
            )}
            <SignOutButton locale={locale} />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <MonthCoverage orgId={org.id} plan={plan} locale={locale} />
        </div>

        <TransactionsView
          locale={locale}
          household={household}
          members={members}
          categories={await getCategoriesFor(org.id)}
        />
      </main>
    </div>
  );
}
