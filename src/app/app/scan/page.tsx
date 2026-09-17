import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { ReceiptScanner } from "@/components/ReceiptScanner";
import { getCategoriesFor } from "@/lib/categorize/custom";
import { getOrgPlan } from "@/lib/billing/plan";
import { limit } from "@/lib/billing/entitlements";
import { statementImportsThisMonth } from "@/lib/billing/usage";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag } from "@/lib/i18n";

export default async function ScanPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const locale = await getLocale();
  const tr = translator(locale);

  const [org] = await sql<{ id: string; name: string }[]>`
    select id, name from organizations where id = ${await getCurrentOrgId()}
  `;
  if (!org) redirect("/signin");

  const { plan } = await getOrgPlan(org.id);
  const used = await statementImportsThisMonth(org.id);
  const max = limit(plan, "statementImports");
  const remaining = max === -1 ? "∞" : Math.max(0, max - used);

  const recent = await sql<
    { description: string | null; gross_cents: string; currency: string; category: string | null; occurred_at: Date }[]
  >`
    select description, gross_cents, currency, category, occurred_at
    from transactions
    where org_id = ${org.id} and source = 'manual' and direction = 'expense'
    order by occurred_at desc, id desc
    limit 5
  `;

  return (
    <div className="app">
      <Sidebar orgId={org.id} orgName={org.name} active="scan" />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nav.scan")}</h1>
            <div className="sub">{tr("scan.sub", { n: remaining })}</div>
          </div>
          <div className="actions"><SignOutButton locale={locale} /></div>
        </div>

        <ReceiptScanner locale={locale}  categories={await getCategoriesFor(org.id)} />

        {recent.length > 0 && (
          <div className="panel recent" style={{ marginTop: 16, maxWidth: 560 }}>
            <div className="panel-head" style={{ marginBottom: 10 }}><h3>{tr("scan.recent")}</h3></div>
            {recent.map((r, i) => (
              <div className="ri" key={i}>
                <div className="th">{r.category?.slice(0, 3).toUpperCase() ?? tr("tx.receiptBadge")}</div>
                <div>
                  <b>{r.description ?? tr("cal.noName")}</b>
                  <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                    {new Date(r.occurred_at).toLocaleDateString(localeTag(locale), { day: "numeric", month: "short" })} · {r.category ?? tr("ov.other")}
                  </div>
                </div>
                <span className="amt">−{formatMoney(Number(r.gross_cents), r.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
