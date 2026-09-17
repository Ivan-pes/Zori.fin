import { NextRequest, NextResponse } from "next/server";
import { importBankPdf } from "@/lib/pdf/import";
import { categorizeTransactions } from "@/lib/categorize/run";
import { requireWritableOrg } from "@/lib/guard-write";
import { resolveImportTargets } from "@/lib/import-targets";
import { getOrgPlan } from "@/lib/billing/plan";
import { limit, withinLimit } from "@/lib/billing/entitlements";
import { statementImportsThisMonth, logImport } from "@/lib/billing/usage";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const targets = await resolveImportTargets(req.nextUrl.searchParams.get("targets"));
  if (!targets.ok) return NextResponse.json({ error: targets.error }, { status: 403 });

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }
  if (buf.byteLength > 15_000_000) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  // Лимиты всех целей проверяем ДО дорогого LLM-парсинга.
  for (const orgId of targets.orgIds) {
    const { plan } = await getOrgPlan(orgId);
    if (!withinLimit(plan, "statementImports", await statementImportsThisMonth(orgId))) {
      return NextResponse.json(
        { error: `Лимит импортов выписки в этом месяце исчерпан (${limit(plan, "statementImports")}). Обновите тариф.` },
        { status: 429 }
      );
    }
  }

  const base64 = Buffer.from(buf).toString("base64");

  try {
    // Парсинг один, вставка во все выбранные пространства.
    const result = await importBankPdf(targets.orgIds, base64);
    if (result.imported > 0) {
      for (const orgId of targets.orgIds) {
        await categorizeTransactions(orgId);
        await logImport(orgId, "pdf");
      }
    }
    return NextResponse.json({ ...result, targets: targets.orgIds.length });
  } catch (err) {
    console.error("pdf import error:", err);
    return NextResponse.json({ error: "import failed" }, { status: 500 });
  }
}
