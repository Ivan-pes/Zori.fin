import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { getAccountContext } from "@/lib/account/context";
import { getCategorySignals } from "@/lib/metrics/categorySignalsData";
import { loadCustomCategoriesWithUsage } from "@/lib/categorize/custom";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { CategoriesView } from "@/components/CategoriesView";
import { CategoryManager } from "@/components/CategoryManager";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag } from "@/lib/i18n";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const locale = await getLocale();
  const tr = translator(locale);

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/signin");
  const ctx = await getAccountContext(orgId);
  if (!ctx) redirect("/signin");

  const [orgRow] = await sql<{ name: string }[]>`select name from organizations where id = ${orgId}`;
  const orgName = orgRow?.name ?? "Zori";

  // ?month=YYYY-MM — смотреть сигналы за конкретный месяц (листание пред/след).
  const params = await searchParams;
  const monthParam = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : null;
  const asOf = monthParam
    ? new Date(Date.UTC(+monthParam.slice(0, 4), +monthParam.slice(5, 7), 0, 23, 59, 59)) // конец месяца
    : new Date();

  const [{ signals, coverage, currency, month }, custom] = await Promise.all([
    getCategorySignals(orgId, asOf, locale),
    loadCustomCategoriesWithUsage(orgId),
  ]);
  const monthDate = new Date(`${month}-01T00:00:00Z`);
  const monthLabel = monthDate.toLocaleDateString(localeTag(locale), { month: "long", year: "numeric" });
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const shownYm = monthParam ?? month; // без параметра показываем последний месяц с данными
  const [sy, sm] = shownYm.split("-").map(Number);
  const prevYm = ym(new Date(Date.UTC(sy!, sm! - 2, 1)));
  const nextYm = ym(new Date(Date.UTC(sy!, sm!, 1)));
  const nowYm = ym(new Date());

  return (
    <div className="app">
      <Sidebar orgId={orgId} orgName={orgName} active="categories" />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("nav.categories")}</h1>
            <div className="sub">{monthLabel}</div>
          </div>
          <div className="actions">
            <a className="btn btn-line btn-sm" href={`/app/categories?month=${prevYm}`}>←</a>
            {shownYm !== nowYm && <a className="btn btn-line btn-sm" href="/app/categories">{tr("mon.now")}</a>}
            <a className="btn btn-line btn-sm" href={`/app/categories?month=${nextYm}`}>→</a>
            <SignOutButton locale={locale} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <CategoryManager custom={custom} locale={locale} />
        </div>

        <CategoriesView
          signals={signals}
          coverage={coverage}
          currency={currency}
          accountType={ctx.type}
          locale={locale}
        />
      </main>
    </div>
  );
}
