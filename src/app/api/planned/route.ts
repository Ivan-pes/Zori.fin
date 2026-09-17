import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";

const create = z.object({
  label: z.string().trim().min(1).max(60),
  amountCents: z.number().int().min(1).max(100_000_000),
  direction: z.enum(["income", "expense"]),
  category: z.string().trim().max(60).nullable().optional(),
  kind: z.enum(["once", "monthly"]),
  startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные плановой операции" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  const d = parsed.data;
  const [row] = await sql<{ id: string }[]>`
    insert into planned_items (org_id, label, amount_cents, direction, category, kind, start_day, end_day)
    values (${orgId}, ${d.label}, ${d.amountCents}, ${d.direction}, ${d.category ?? null}, ${d.kind}, ${d.startDay}, ${d.endDay ?? null})
    returning id
  `;
  return NextResponse.json({ ok: true, id: row?.id });
}

// Отменить подписку с даты (проставить end_day).
const patch = z.object({ id: z.string().uuid(), endDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  await sql`update planned_items set end_day = ${parsed.data.endDay} where id = ${parsed.data.id} and org_id = ${orgId}`;
  return NextResponse.json({ ok: true });
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
  await sql`delete from planned_items where id = ${parsed.data.id} and org_id = ${orgId}`;
  return NextResponse.json({ ok: true });
}
