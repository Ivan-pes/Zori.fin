import { NextRequest, NextResponse } from "next/server";
import { extractReceipt } from "@/lib/receipts/extract";
import { requireWritableOrg } from "@/lib/guard-write";
import { getOrgPlan, getPersonalPlan } from "@/lib/billing/plan";
import { limit, withinLimit } from "@/lib/billing/entitlements";
import { limitP, withinLimitP } from "@/lib/billing/entitlements.personal";
import { getAccountContext } from "@/lib/account/context";
import { statementImportsThisMonth, logImport } from "@/lib/billing/usage";
import { getCategoriesFor } from "@/lib/categorize/custom";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;

  const used = await statementImportsThisMonth(orgId);
  const ctx = await getAccountContext(orgId);
  let scanMax: number;
  let scanOk: boolean;
  if (ctx?.type === "personal") {
    const pplan = await getPersonalPlan(orgId);
    scanMax = limitP(pplan, "receiptScans");
    scanOk = withinLimitP(pplan, "receiptScans", used);
  } else {
    const { plan } = await getOrgPlan(orgId);
    scanMax = limit(plan, "statementImports");
    scanOk = withinLimit(plan, "statementImports", used);
  }
  if (!scanOk) {
    return NextResponse.json(
      { error: `Лимит сканов в этом месяце исчерпан (${scanMax}). Обновите тариф.` },
      { status: 429 }
    );
  }

  const mediaType = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const allowed = mediaType.startsWith("image/") || mediaType === "application/pdf";
  if (!allowed) {
    return NextResponse.json({ error: "Поддерживаются фото (JPG/PNG/WebP) и PDF." }, { status: 415 });
  }

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return NextResponse.json({ error: "Пустой файл" }, { status: 400 });
  if (buf.byteLength > 15_000_000) {
    return NextResponse.json({ error: "Файл слишком большой (макс 15 МБ)." }, { status: 413 });
  }

  const base64 = Buffer.from(buf).toString("base64");
  const result = await extractReceipt(base64, mediaType, {
    categories: await getCategoriesFor(orgId),
    accountType: ctx?.type ?? "business",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  await logImport(orgId, "receipt");
  return NextResponse.json({ fields: result.fields });
}
