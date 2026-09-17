import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { ForecastPanel } from "@/components/ForecastPanel";
import { UpgradeGate } from "@/components/UpgradeGate";
import { loadTransactions } from "@/lib/transactions";
import { computePnL, expensesByCategory } from "@/lib/metrics/engine";
import { getOrgPlan } from "@/lib/billing/plan";
import { can } from "@/lib/billing/entitlements";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { categoryLabel } from "@/lib/i18n/categories";
import { getAccountContext } from "@/lib/account/context";
import { getPersonalPlan } from "@/lib/billing/plan";
import { canP } from "@/lib/billing/entitlements.personal";

export default async function ForecastPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const locale = await getLocale();
  const tr = translator(locale);

  const [org] = await sql<{ id: string; name: string }[]>`
    select id, name from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const acct = await getAccountContext(org.id);
  const personal = acct?.type === "personal";
  const title = personal ? tr("pf.title") : tr("nav.forecast");
  const sub = personal ? tr("pf.sub") : tr("fc.sub");

  const { plan } = await getOrgPlan(org.id);
  const allowed = personal ? canP(await getPersonalPlan(org.id), "cashAlerts") : can(plan, "forecast");
  if (!allowed) {
    return (
      <div className="app">
        <Sidebar orgId={org.id} orgName={org.name} active="forecast" />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>{title}</h1>
              <div className="sub">{sub}</div>
            </div>
            <div className="actions"><SignOutButton locale={locale} /></div>
          </div>
          {personal ? (
            <div className="note info" style={{ maxWidth: 560 }}>
              <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              <span>{tr("pf.gate")}</span>
            </div>
          ) : (
            <UpgradeGate title={tr("nav.forecast")} feature={tr("fc.gateFeature")} plan="starter" locale={locale} />
          )}
        </main>
      </div>
    );
  }

  const now = new Date();
  const txns = await loadTransactions(org.id, { from: new Date(now.getTime() - 30 * 86_400_000), to: new Date(now.getTime() + 86_400_000) });
  const pnl = computePnL(txns);
  const cats = expensesByCategory(txns);
  const cur = pnl.currency;
  const hasData = txns.length > 0;

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="forecast" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            <div className="sub">{sub}</div>
          </div>
          <div className="actions"><SignOutButton locale={locale} /></div>
        </div>

        <ForecastPanel locale={locale} variant={personal ? "personal" : "business"} currency={acct?.baseCurrency ?? cur} />

        <div className="grid-2 even" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head"><h3>{tr("fc.influences")}</h3><span className="muted" style={{ fontSize: 12.5 }}>{tr("fc.30days")}</span></div>
            {hasData ? (
              <table className="tx-table">
                <tbody>
                  <tr>
                    <td><span className="tx-name">{tr("fc.inflows")}</span></td>
                    <td className="muted" style={{ textAlign: "right", fontSize: 13 }}>{tr("fc.in30")}</td>
                    <td className="amt pos">+{formatMoney(pnl.netRevenueCents, cur)}</td>
                  </tr>
                  {pnl.feeCents > 0 && (
                    <tr>
                      <td><span className="tx-name">{tr("pnl.stripeFees")}</span></td>
                      <td className="muted" style={{ textAlign: "right", fontSize: 13 }}>{tr("fc.in30")}</td>
                      <td className="amt neg">−{formatMoney(pnl.feeCents, cur)}</td>
                    </tr>
                  )}
                  {cats.map((c) => (
                    <tr key={c.category}>
                      <td><span className="tx-name">{categoryLabel(c.category, locale)}</span></td>
                      <td className="muted" style={{ textAlign: "right", fontSize: 13 }}>{tr("fc.in30")}</td>
                      <td className="amt neg">−{formatMoney(c.totalCents, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>
                {tr("fc.fewOps")}
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>{tr("fc.howAccurate")}</h3></div>
            <div className="note info" style={{ marginTop: 0 }}>
              <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
              <span>{tr("fc.connectPre")} <Link href="/app/integrations" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{tr("nav.integrations")}</Link> {tr("fc.connectPost")}</span>
            </div>
            <div className="cap" style={{ marginTop: 14 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              {tr("fc.accuracyGrows")}
              <span className="conf">{tr("fc.nowLevel", { level: hasData ? tr("fc.levelMedium") : tr("fc.levelLow") })}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
