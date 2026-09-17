import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { syncLiquidBalance } from "@/lib/personal/data";
import { CURRENCIES } from "@/lib/currency";

/** Для личных пространств «Остаток на счетах» = сумма ручных ликвидных счетов. */
async function syncIfPersonal(orgId: string) {
  const [org] = await sql<{ type: string | null }[]>`select type from organizations where id = ${orgId}`;
  if (org?.type === "personal") await syncLiquidBalance(orgId);
}

const KIND = z.enum(["cash", "bank", "card", "savings", "asset", "debt"]);

const create = z.object({
  kind: KIND,
  name: z.string().trim().min(1).max(60),
  balanceCents: z.number().int().min(-100_000_000_000).max(100_000_000_000),
  currency: z.enum(CURRENCIES).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные счёта" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  const d = parsed.data;
  // Долг храним отрицательным.
  const signed = d.kind === "debt" ? -Math.abs(d.balanceCents) : d.balanceCents;
  const [row] = await sql<{ id: string }[]>`
    insert into accounts (org_id, kind, name, balance_cents, currency, manual)
    values (${orgId}, ${d.kind}, ${d.name}, ${signed}, ${d.currency ?? "EUR"}, true)
    returning id
  `;
  if (orgId) await syncIfPersonal(orgId);
  return NextResponse.json({ ok: true, id: row?.id });
}

const del = z.object({ id: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = del.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  await sql`delete from accounts where id = ${parsed.data.id} and org_id = ${orgId}`;
  if (orgId) await syncIfPersonal(orgId);
  return NextResponse.json({ ok: true });
}
