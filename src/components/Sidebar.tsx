import Link from "next/link";
import { Brand } from "@/components/Brand";
import { MobileNav } from "@/components/MobileNav";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SilentBankSync } from "@/components/SilentBankSync";
import { sql } from "@/lib/db";
import { getOrgPlan, getPersonalPlan, getTrialInfo } from "@/lib/billing/plan";
import { getAccessibleOrgs } from "@/lib/session";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { getAccountContext } from "@/lib/account/context";
import { yaxiEnabled } from "@/lib/env";
import { yaxiClientUrl } from "@/lib/yaxi/ticket";

type Section = "overview" | "assistant" | "calendar" | "goals" | "pnl" | "forecast" | "reports" | "transactions" | "categories" | "scan" | "integrations" | "settings" | "budgets" | "subscriptions" | "networth" | "team";

function trialDaysLeft(endsAt: Date | null): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
}

export async function Sidebar({ orgId, orgName, active }: { orgId: string; orgName: string; active: Section }) {
  const locale = await getLocale();
  const tr = translator(locale);
  const acct = await getAccountContext(orgId);
  const personal = acct?.type === "personal";
  const { plan } = await getOrgPlan(orgId);
  const trial = await getTrialInfo(orgId);
  const [row] = await sql<{ avatar_data_url: string | null }[]>`
    select avatar_data_url from organizations where id = ${orgId}
  `;
  const avatar = row?.avatar_data_url ?? null;
  const orgs = await getAccessibleOrgs();

  // Тихий автосинк: при заходе тихо подтягиваем свежие операции по каждому
  // живому YAXI-банку (доступ хранится в браузере пользователя).
  const yaxiIntgs = yaxiEnabled
    ? await sql<{ external_account_id: string; last_synced_at: Date | null; metadata: { provider?: string; institution_name?: string } }[]>`
        select external_account_id, last_synced_at, metadata from integrations
        where org_id = ${orgId} and provider = 'gocardless' and status = 'active'
          and metadata->>'provider' = 'yaxi'
        order by created_at desc
      `
    : [];
  const syncBanks = yaxiIntgs.map((i) => ({
    connectionId: i.external_account_id.replace(/^yaxi:/, ""),
    institutionName: i.metadata?.institution_name ?? "bank",
    lastSyncedMs: i.last_synced_at ? new Date(i.last_synced_at).getTime() : null,
  }));
  // Личные пространства показывают личный тариф (Pro/Plus/Free), бизнес — бизнесовый.
  const pPlan = personal ? await getPersonalPlan(orgId) : null;
  const planLabel = trial.trialing
    ? tr("plan.trial", { days: trialDaysLeft(trial.endsAt) })
    : personal
      ? tr(plan === "pro" ? "plan.pro" : pPlan === "plus" ? "plan.plus" : "plan.free")
      : tr(`plan.${plan}`);

  return (
    <>
      {syncBanks.length > 0 && (
        <SilentBankSync banks={syncBanks} clientUrl={yaxiClientUrl()} locale={locale} />
      )}
      <MobileNav locale={locale} />
      <aside className="side">
      <Link href="/"><Brand /></Link>

      <Link href="/app" className={`nav-item ${active === "overview" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>{tr("nav.overview")}
      </Link>
      <Link href="/app/budgets" className={`nav-item ${active === "budgets" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 9 9h-9z" /></svg>{tr("bud.nav")}
      </Link>
      <Link href="/app/subscriptions" className={`nav-item ${active === "subscriptions" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M8 9l3 3 5-6" /><path d="M8 15h8" /></svg>{personal ? tr("subs.nav") : tr("bs.nav")}
      </Link>
      {personal && (
        <Link href="/app/networth" className={`nav-item ${active === "networth" ? "on" : ""}`}>
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21V9l8-6 8 6v12" /><path d="M9 21v-6h6v6" /></svg>{tr("nw.nav")}
        </Link>
      )}
      {personal && (
        <Link href="/app/reports" className={`nav-item ${active === "reports" ? "on" : ""}`}>
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" /></svg>{tr("dig.nav")}
        </Link>
      )}
      <Link href="/app/assistant" className={`nav-item ${active === "assistant" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>{tr("nav.assistant")}
      </Link>
      <Link href="/app/calendar" className={`nav-item ${active === "calendar" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>{personal ? tr("nav.pCalendar") : tr("nav.calendar")}
      </Link>
      <Link href="/app/goals" className={`nav-item ${active === "goals" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>{personal ? tr("nav.pGoals") : tr("nav.goals")}
      </Link>
      {!personal && (
        <Link href="/app/pnl" className={`nav-item ${active === "pnl" ? "on" : ""}`}>
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>{tr("nav.pnl")}
        </Link>
      )}
      <Link href="/app/forecast" className={`nav-item ${active === "forecast" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8" /><circle cx="12" cy="12" r="3" /></svg>{personal ? tr("nav.pForecast") : tr("nav.forecast")}
      </Link>
      {!personal && (
        <Link href="/app/reports" className={`nav-item ${active === "reports" ? "on" : ""}`}>
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" /></svg>{tr("nav.reports")}
        </Link>
      )}
      <Link href="/app/transactions" className={`nav-item ${active === "transactions" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h10" /></svg>{tr("nav.transactions")}
      </Link>
      <Link href="/app/categories" className={`nav-item ${active === "categories" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>{tr("nav.categories")}
      </Link>

      <div className="nav-group">{tr("nav.tools")}</div>
      <Link href="/app/scan" className={`nav-item ${active === "scan" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>{tr("nav.scan")}
      </Link>

      <div className="nav-group">{tr("nav.settingsGroup")}</div>
      <Link href="/app/team" className={`nav-item ${active === "team" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>{personal ? tr("nav.family") : tr("nav.team")}
      </Link>
      <Link href="/app/integrations" className={`nav-item ${active === "integrations" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 7h7M3 7h7M14 17h7M3 17h7" /><circle cx="10" cy="7" r="2" /><circle cx="14" cy="17" r="2" /></svg>{tr("nav.integrations")}
      </Link>
      <Link href="/app/settings" className={`nav-item ${active === "settings" ? "on" : ""}`}>
        <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>{tr("nav.settings")}
      </Link>

      <div className="side-foot">
        <LanguageSwitcher current={locale} drop="up" />
        {orgs.length > 0 ? (
          <OrgSwitcher orgs={orgs} activeId={orgId} planLabel={planLabel} avatarDataUrl={avatar} locale={locale} />
        ) : (
          <div className="user">
            <div className="av">{(orgName.trim()[0] ?? "Z").toUpperCase()}</div>
            <div className="meta"><b>{orgName}</b><br /><span>{planLabel}</span></div>
          </div>
        )}
      </div>
      </aside>
    </>
  );
}
