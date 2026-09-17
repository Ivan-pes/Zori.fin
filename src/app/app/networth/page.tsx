import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { getAccountContext } from "@/lib/account/context";
import { getNetWorth } from "@/lib/personal/data";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { NetWorthView } from "@/components/NetWorthView";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";

export default async function NetWorthPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const locale = await getLocale();
  const tr = translator(locale);

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/signin");
  const ctx = await getAccountContext(orgId);
  if (!ctx) redirect("/signin");
  if (ctx.type !== "personal") redirect("/app");

  const [orgRow] = await sql<{ name: string }[]>`select name from organizations where id = ${orgId}`;
  const orgName = orgRow?.name ?? "Zori";

  const data = await getNetWorth(orgId);

  return (
    <div className="app">
      <Sidebar orgId={orgId} orgName={orgName} active="networth" />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nw.title")}</h1>
            <div className="sub">{tr("nw.sub")}</div>
          </div>
          <div className="actions"><SignOutButton locale={locale} /></div>
        </div>

        {data && <NetWorthView nw={data.nw} currency={data.currency} trend={data.trend} locale={locale} />}
      </main>
    </div>
  );
}
