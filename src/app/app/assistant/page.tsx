import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { DashboardChat } from "@/components/DashboardChat";
import { QuickQuestions } from "@/components/QuickQuestions";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const locale = await getLocale();
  const tr = translator(locale);

  const [org] = await sql<{ id: string; name: string; base_currency: string | null }[]>`
    select id, name, base_currency from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const [intg] = await sql<{ n: number }[]>`
    select count(*)::int as n from integrations where org_id = ${org.id} and provider = 'stripe' and status = 'active'
  `;
  const connected = (intg?.n ?? 0) > 0;
  const [cnt] = await sql<{ n: number }[]>`select count(*)::int as n from transactions where org_id = ${org.id}`;
  const txCount = cnt?.n ?? 0;

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="assistant" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nav.assistant")}</h1>
            <div className="sub">{tr("asst.sub")} · RU / EN / ES</div>
          </div>
          <div className="actions"><SignOutButton locale={locale} /></div>
        </div>

        <div className="grid-2">
          <div className="panel assist assist-tall">
            <div className="panel-head">
              <h3>{tr("asst.dialog")}</h3>
              <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>● {tr("ov.online")}</span>
            </div>
            <DashboardChat locale={locale} currency={org.base_currency ?? "EUR"} />
          </div>

          <div>
            <div className="panel">
              <div className="panel-head"><h3>{tr("asst.context")}</h3></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                  <span className={`st-dot ${connected ? "st-on" : "st-off"}`}><span className="d" /></span>
                  {connected ? tr("asst.stripeOn", { n: txCount }) : tr("asst.stripeOff")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: txCount > 0 ? undefined : "var(--ink-faint)" }}>
                  <span className={`st-dot ${txCount > 0 ? "st-on" : "st-off"}`}><span className="d" /></span>
                  {txCount > 0 ? tr("asst.profitCalc") : tr("asst.noMetrics")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "var(--ink-faint)" }}>
                  <span className="st-dot st-off"><span className="d" /></span>
                  {tr("asst.paypalOff")}
                </div>
              </div>
              <div className="note info">
                <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <span>{tr("asst.contextNote")}</span>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 16 }}>
              <div className="panel-head"><h3>{tr("asst.quickQ")}</h3></div>
              <QuickQuestions locale={locale} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
