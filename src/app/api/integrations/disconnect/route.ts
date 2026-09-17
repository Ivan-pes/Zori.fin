import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireOwnerOrg } from "@/lib/guard-write";

// Отключение интеграции удаляет её транзакции — только владелец.
export async function POST(req: NextRequest) {
  const guard = await requireOwnerOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { target, externalAccountId } = (await req.json().catch(() => ({}))) as {
    target?: string;
    externalAccountId?: string;
  };

  if (target === "stripe") {
    await sql`delete from integrations where org_id = ${orgId} and provider = 'stripe'`;
    await sql`delete from stripe_subscriptions where org_id = ${orgId}`;
    await sql`delete from transactions where org_id = ${orgId} and source = 'stripe'`;
    return NextResponse.json({ ok: true });
  }

  if (target === "bank") {
    // Мультибанк: с externalAccountId — только этот банк; без него — все живые
    // банки (выписки при этом не трогаем, у них отдельная кнопка).
    if (externalAccountId) {
      await sql`delete from integrations where org_id = ${orgId} and provider = 'gocardless' and external_account_id = ${externalAccountId}`;
      await sql`delete from transactions where org_id = ${orgId} and source = 'gocardless' and external_account_id = ${externalAccountId}`;
    } else {
      await sql`delete from integrations where org_id = ${orgId} and provider = 'gocardless'`;
      await sql`delete from transactions where org_id = ${orgId} and source = 'gocardless'`;
    }
    return NextResponse.json({ ok: true });
  }

  if (target === "statements") {
    await sql`delete from transactions where org_id = ${orgId} and source = 'csv'`;
    return NextResponse.json({ ok: true });
  }

  if (target === "paypal") {
    await sql`delete from integrations where org_id = ${orgId} and provider = 'paypal'`;
    await sql`delete from transactions where org_id = ${orgId} and source = 'paypal'`;
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown target" }, { status: 400 });
}
