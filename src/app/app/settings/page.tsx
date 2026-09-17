import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId, getCurrentMembership } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { SettingsView } from "@/components/SettingsView";
import { stripe } from "@/lib/stripe/client";
import { getOrgPlan, getPersonalPlan, isComped, markSubscriptionActive } from "@/lib/billing/plan";
import { limit } from "@/lib/billing/entitlements";
import { limitP } from "@/lib/billing/entitlements.personal";
import { env } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ billing?: string; session_id?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const uiLocale = await getLocale();
  const tr = translator(uiLocale);

  const params = await searchParams;
  const billing = params.billing;
  const prices = {
    starter: !!env.STRIPE_PRICE_STARTER,
    growth: !!env.STRIPE_PRICE_GROWTH,
    pro: !!env.STRIPE_PRICE_PRO,
    plus: !!env.STRIPE_PRICE_PLUS,
  };

  const [org] = await sql<{ id: string; name: string; notification_prefs: Record<string, boolean> | null; tax_rate_pct: string | null; industry: string | null; base_currency: string | null; locale: string | null; avatar_data_url: string | null; type: string | null; household: boolean | null }[]>`
    select id, name, notification_prefs, tax_rate_pct, industry, base_currency, locale, avatar_data_url, type, household from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const [u2fa] = await sql<{ twofa_method: string | null }[]>`
    select twofa_method from users where id = ${session.user.id}
  `;
  const twofaMethod: "none" | "totp" | "email" =
    u2fa?.twofa_method === "totp" || u2fa?.twofa_method === "email" ? u2fa.twofa_method : "none";

  if (params.session_id) {
    try {
      const cs = await stripe.checkout.sessions.retrieve(params.session_id);
      if (cs.payment_status === "paid" && cs.metadata?.orgId === org.id) {
        const customerId = typeof cs.customer === "string" ? cs.customer : cs.customer?.id ?? null;
        await markSubscriptionActive(org.id, customerId, cs.metadata?.plan ?? null);
      }
    } catch {}
  }

  const [intg] = await sql<{ n: number }[]>`
    select count(*)::int as n from integrations where org_id = ${org.id} and provider = 'stripe' and status = 'active'
  `;
  const connected = (intg?.n ?? 0) > 0;
  const { plan: currentPlan } = await getOrgPlan(org.id);
  const comped = await isComped(org.id);
  const isPersonal = org.type === "personal";
  const personalPlan = isPersonal ? await getPersonalPlan(org.id) : "free_personal";

  const members = await sql<{ id: string; email: string; role: string; status: string; label: string | null }[]>`
    select id, email, role, status, label from memberships
    where org_id = ${org.id} and status != 'revoked' order by created_at asc
  `;
  const isOwner = (await getCurrentMembership())?.role === "owner";
  // Личное пространство: места считаем по личному тарифу (household),
  // иначе Plus упирался бы в бизнес-лимит free (1 место) и приглашения были бы скрыты.
  const teamSeats = isPersonal
    ? 1 + limitP(personalPlan, "householdMembers")
    : limit(currentPlan, "teamSeats");

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="settings" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nav.settings")}</h1>
            <div className="sub">{tr("set.sub")}</div>
          </div>
          <div className="actions"><SignOutButton locale={uiLocale} /></div>
        </div>

        {billing === "success" && (
          <div style={{ background: "var(--accent-soft)", color: "var(--accent-ink)", border: "1px solid #CDE5DC", borderRadius: 12, padding: "12px 16px", marginBottom: 18, fontSize: 14 }}>
            {tr("set.paySuccess")}
          </div>
        )}
        {billing === "cancel" && (
          <div style={{ background: "var(--surface-2)", color: "var(--ink-soft)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", marginBottom: 18, fontSize: 14 }}>
            {tr("set.payCancel")}
          </div>
        )}
        <SettingsView orgName={org.name} email={session.user.email ?? ""} stripeConnected={connected} notifPrefs={org.notification_prefs ?? {}} prices={prices} currentPlan={currentPlan} members={members} teamSeats={teamSeats} taxRatePct={org.tax_rate_pct !== null ? Number(org.tax_rate_pct) : null} industry={org.industry} baseCurrency={org.base_currency ?? "EUR"} locale={org.locale ?? "ru"} avatarDataUrl={org.avatar_data_url} twofaMethod={twofaMethod} uiLocale={uiLocale} accountType={isPersonal ? "personal" : "business"} personalPlan={personalPlan} pricePlus={!!prices.plus} household={org.household === true} isOwner={isOwner} comped={comped} />
      </main>
    </div>
  );
}
