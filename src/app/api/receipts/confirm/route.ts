import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sql } from "@/lib/db";
import { requireWritableOrg } from "@/lib/guard-write";

const schema = z.object({
  amountCents: z.number().int().positive(),
  merchant: z.string().trim().max(120).nullable().optional(),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  currency: z.string().trim().min(1).max(8),
  category: z.string().trim().max(60),
});

export async function POST(req: NextRequest) {
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные чека" }, { status: 400 });
  }
  const d = parsed.data;
  const occurredAt = d.dateIso ? new Date(`${d.dateIso}T12:00:00Z`) : new Date();
  const gross = d.amountCents;

  await sql`
    insert into transactions
      (org_id, source, external_id, kind, direction,
       gross_cents, fee_cents, net_cents, currency, occurred_at, description, category)
    values
      (${orgId}, 'manual', ${`receipt-${randomUUID()}`}, 'adjustment', 'expense',
       ${gross}, 0, ${-gross}, ${d.currency.toUpperCase()}, ${occurredAt}, ${d.merchant ?? null}, ${d.category})
  `;

  return NextResponse.json({ ok: true });
}
