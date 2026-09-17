import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { CURRENCIES } from "@/lib/currency";

const create = z.object({
  name: z.string().trim().min(1).max(60),
  amountCents: z.number().int().min(1).max(100_000_000),
  cadence: z.enum(["weekly", "monthly"]).default("monthly"),
  currency: z.enum(CURRENCIES).optional(),
  nextDue: z.string().date().optional(),
  category: z.string().trim().max(60).nullable().optional(),
});

/** Добавить свою подписку (когда авто-детектор её не поймал). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные подписки" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "Организация не выбрана" }, { status: 400 });
  const d = parsed.data;
  const [row] = await sql<{ id: string }[]>`
    insert into manual_subscriptions (org_id, name, amount_cents, cadence, currency, next_due, category)
    values (${orgId}, ${d.name}, ${d.amountCents}, ${d.cadence}, ${d.currency ?? "EUR"}, ${d.nextDue ?? null}, ${d.category ?? null})
    returning id
  `;
  return NextResponse.json({ ok: true, id: row?.id });
}

const del = z.object({
  manualId: z.string().uuid().optional(),
  matchKey: z.string().min(1).optional(),
});

/**
 * Удалить подписку: manualId → удаляем ручную; matchKey → скрываем ложную
 * авто-определённую (заносим в hidden_subscriptions).
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = del.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.manualId && !parsed.data.matchKey)) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "Организация не выбрана" }, { status: 400 });

  if (parsed.data.manualId) {
    await sql`delete from manual_subscriptions where id = ${parsed.data.manualId} and org_id = ${orgId}`;
  } else if (parsed.data.matchKey) {
    await sql`
      insert into hidden_subscriptions (org_id, match_key) values (${orgId}, ${parsed.data.matchKey})
      on conflict (org_id, match_key) do nothing
    `;
  }
  return NextResponse.json({ ok: true });
}

const restore = z.object({ matchKey: z.string().min(1) });

/** Вернуть ранее скрытую авто-подписку: убираем ключ из hidden_subscriptions. */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;

  const parsed = restore.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "Организация не выбрана" }, { status: 400 });

  await sql`delete from hidden_subscriptions where org_id = ${orgId} and match_key = ${parsed.data.matchKey}`;
  return NextResponse.json({ ok: true });
}
