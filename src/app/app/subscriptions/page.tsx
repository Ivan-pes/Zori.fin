import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { getAccountContext } from "@/lib/account/context";
import { getSubscriptions } from "@/lib/personal/data";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { SubscriptionsManager } from "@/components/SubscriptionsManager";
import { getCategoriesFor } from "@/lib/categorize/custom";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag } from "@/lib/i18n";

export default async function SubscriptionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const locale = await getLocale();
  const tr = translator(locale);
  const tag = localeTag(locale);

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/signin");
  const ctx = await getAccountContext(orgId);
  if (!ctx) redirect("/signin");
  // Аудит регулярных списаний полезен и бизнесу (SaaS-подписки, сервисы).

  const [orgRow] = await sql<{ name: string }[]>`select name from organizations where id = ${orgId}`;
  const orgName = orgRow?.name ?? "Zori";

  const biz = ctx.type !== "personal";
  const [data, categories] = await Promise.all([getSubscriptions(orgId), getCategoriesFor(orgId)]);
  const cur = data?.currency ?? "EUR";
  const s = data?.summary;
  const items = data?.recurring ?? [];

  return (
    <div className="app">
      <Sidebar orgId={orgId} orgName={orgName} active="subscriptions" />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>{biz ? tr("bs.title") : tr("subs.title")}</h1>
            <div className="sub">
              {s ? tr("subs.sub", {
                count: s.count,
                monthly: formatMoney(s.monthlyCents, cur),
                yearly: formatMoney(s.yearlyCents, cur),
              }) : ""}
            </div>
          </div>
          <div className="actions"><SignOutButton locale={locale} /></div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>{biz ? tr("bs.head") : tr("subs.head")}</h3>
            <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{biz ? tr("bs.headNote") : tr("subs.headNote")}</span>
          </div>
          <SubscriptionsManager
            items={items}
            currency={cur}
            locale={locale}
            categories={categories}
            variant={biz ? "business" : "personal"}
            hidden={data?.hidden ?? []}
          />
        </div>
      </main>
    </div>
  );
}
