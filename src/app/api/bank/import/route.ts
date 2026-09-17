import { NextRequest, NextResponse } from "next/server";
import { importBankCsv } from "@/lib/csv/import";
import { categorizeTransactions } from "@/lib/categorize/run";
import { requireWritableOrg } from "@/lib/guard-write";
import { resolveImportTargets } from "@/lib/import-targets";
import { getOrgPlan } from "@/lib/billing/plan";
import { limit, withinLimit } from "@/lib/billing/entitlements";
import { statementImportsThisMonth, logImport } from "@/lib/billing/usage";

export async function POST(req: NextRequest) {
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  // Цели: ?targets=id1,id2 — выписка может лечь в личное и бизнес сразу.
  const targets = await resolveImportTargets(req.nextUrl.searchParams.get("targets"));
  if (!targets.ok) return NextResponse.json({ error: targets.error }, { status: 403 });

  const text = await req.text();
  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }
  if (text.length > 10_000_000) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  try {
    let imported = 0;
    let skipped = 0;
    for (const orgId of targets.orgIds) {
      const { plan } = await getOrgPlan(orgId);
      if (!withinLimit(plan, "statementImports", await statementImportsThisMonth(orgId))) {
        return NextResponse.json(
          { error: `Лимит импортов выписки в этом месяце исчерпан (${limit(plan, "statementImports")}). Обновите тариф.` },
          { status: 429 }
        );
      }
      const result = await importBankCsv(orgId, text);
      imported += result.imported;
      skipped += result.skipped ?? 0;
      if (result.imported > 0) {
        await categorizeTransactions(orgId);
        await logImport(orgId, "csv");
      }
    }
    return NextResponse.json({ imported, skipped, targets: targets.orgIds.length });
  } catch (err) {
    console.error("csv import error:", err);
    return NextResponse.json({ error: "import failed" }, { status: 500 });
  }
}
