import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { getAccountContext } from "@/lib/account/context";
import { getBudgetStatus, getBudgetSuggestions, getMonthlyIncome } from "@/lib/personal/data";
import { BudgetAllocation } from "@/components/BudgetAllocation";
import { getPersonalPlan } from "@/lib/billing/plan";
import { limitP } from "@/lib/billing/entitlements.personal";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { BudgetsView } from "@/components/BudgetsView";
import { getCategoriesFor } from "@/lib/categorize/custom";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionaries";
import { localeTag } from "@/lib/i18n";

export default async function BudgetsPage({
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
  // Бюджеты-конверты доступны и личному, и бизнес-пространству.
  const personal = ctx.type === "personal";

  const [orgRow] = await sql<{ name: string }[]>`select name from organizations where id = ${orgId}`;
  const orgName = orgRow?.name ?? "Zori";

  // Месяц из ?month=YYYY-MM (листание пред/след), по умолчанию — текущий.
  const params = await searchParams;
  const now = new Date();
  const nowYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : nowYm;
  const [yy, mm] = month.split("-").map(Number);
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const prevYm = ym(new Date(Date.UTC(yy!, mm! - 2, 1)));
  const nextYm = ym(new Date(Date.UTC(yy!, mm!, 1)));
  const monthLabel = new Date(Date.UTC(yy!, mm! - 1, 1)).toLocaleDateString(localeTag(locale), { month: "long", year: "numeric" });
  const lines = await getBudgetStatus(orgId, month);
  const monthlyIncomeCents = await getMonthlyIncome(orgId);
  // Лимит конвертов: личная сетка для личных, бизнес — без лимита.
  const maxCategories = personal ? limitP(await getPersonalPlan(orgId), "budgetCategories") : -1;
  // Подсказки — только когда бюджетов ещё нет.
  const suggestions = lines.length === 0 ? await getBudgetSuggestions(orgId) : [];

  return (
    <div className="app">
      <Sidebar orgId={orgId} orgName={orgName} active="budgets" />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>{tr("bud.title")}</h1>
            <div className="sub">{tr("bud.sub", { month: monthLabel })}</div>
          </div>
          <div className="actions">
            <a className="btn btn-line btn-sm" href={`/app/budgets?month=${prevYm}`}>←</a>
            {month !== nowYm && <a className="btn btn-line btn-sm" href="/app/budgets">{tr("mon.now")}</a>}
            <a className="btn btn-line btn-sm" href={`/app/budgets?month=${nextYm}`}>→</a>
            <SignOutButton locale={locale} />
          </div>
        </div>

        <BudgetAllocation
          month={month}
          lines={lines}
          currency={ctx.baseCurrency}
          spendTargetPct={ctx.spendTargetPct}
          monthlyIncomeCents={monthlyIncomeCents}
          locale={locale}
        />

        <BudgetsView lines={lines} month={month} currency={ctx.baseCurrency} categories={await getCategoriesFor(orgId)} maxCategories={maxCategories} suggestions={suggestions} locale={locale} />
      </main>
    </div>
  );
}
