import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { requireWritableOrg } from "@/lib/guard-write";
import { getRates, convertCents } from "@/lib/fx";
import { syncLiquidBalance } from "@/lib/personal/data";
import { CURRENCIES } from "@/lib/currency";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  taxRatePct: z.number().min(0).max(100).nullable().optional(),
  industry: z.enum(["saas", "ecommerce", "agency", "freelance"]).nullable().optional(),
  baseCurrency: z.enum(CURRENCIES).optional(),
  locale: z.enum(["ru", "uk", "en", "es"]).optional(),
  avatarDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,/, "Неподдерживаемый формат изображения")
    .max(400_000, "Изображение слишком большое")
    .nullable()
    .optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
  }
  const d = parsed.data;
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "Организация не выбрана" }, { status: 400 });

  // Текущая валюта и суммы «без валюты» (доход/буфер/ручной баланс) — до апдейта.
  const [org] = await sql<{
    base_currency: string | null; type: string | null;
    salary_cents: string | null; extra_income_cents: string | null;
    safe_threshold_cents: string | null; current_balance_cents: string | null;
  }[]>`
    select base_currency, type, salary_cents, extra_income_cents, safe_threshold_cents, current_balance_cents
    from organizations where id = ${orgId}
  `;
  const oldBase = (org?.base_currency ?? "EUR").toUpperCase();
  const newBase = (d.baseCurrency ?? oldBase).toUpperCase();

  await sql`
    update organizations set
      name = ${d.name},
      tax_rate_pct = ${d.taxRatePct ?? null},
      industry = ${d.industry ?? null},
      base_currency = ${d.baseCurrency ?? "EUR"},
      locale = ${d.locale ?? "ru"},
      avatar_data_url = ${d.avatarDataUrl ?? null}
    where id = ${orgId}
  `;

  // Сменилась базовая валюта → пересчитываем суммы, которые хранятся БЕЗ валюты
  // (зарплата, доп. доходы, буфер, ручной баланс). Иначе число осталось бы прежним,
  // а ярлык валюты сменился — тихая ошибка в расчётах. Счета/подписки/операции
  // конвертируются сами (у них своя валюта).
  if (d.baseCurrency && newBase !== oldBase) {
    const rates = await getRates();
    const conv = (v: string | null) => (v == null ? null : convertCents(Number(v), oldBase, newBase, rates));
    await sql`
      update organizations set
        salary_cents = ${conv(org?.salary_cents ?? null)},
        extra_income_cents = ${conv(org?.extra_income_cents ?? null)},
        safe_threshold_cents = ${conv(org?.safe_threshold_cents ?? null)},
        current_balance_cents = ${conv(org?.current_balance_cents ?? null)}
      where id = ${orgId}
    `;
    // Остальные суммы, которые тоже хранятся БЕЗ валюты (подразумевается база):
    // бюджеты-лимиты, цели, плановые операции календаря, таргеты и допущения
    // сценариев прогноза. Их надо пересчитать тем же множителем курса, иначе
    // после смены базы число останется прежним, а ярлык валюты сменится.
    // Множитель old→new = rates[new]/rates[old] (эквивалент convertCents).
    const rOld = rates[oldBase];
    const rNew = rates[newBase];
    const mult = rOld && rNew ? rNew / rOld : 1;
    if (mult !== 1) {
      await sql`update budgets set amount_cents = round(amount_cents * ${mult}::float8)::bigint where org_id = ${orgId}`;
      await sql`update targets set amount_cents = round(amount_cents * ${mult}::float8)::bigint where org_id = ${orgId}`;
      await sql`update planned_items set amount_cents = round(amount_cents * ${mult}::float8)::bigint where org_id = ${orgId}`;
      await sql`update goals set target_cents = round(target_cents * ${mult}::float8)::bigint, current_cents = round(current_cents * ${mult}::float8)::bigint where org_id = ${orgId}`;
      // Сценарии прогноза: суммы лежат в jsonb assumptions (monthlyDeltaCents/oneOffCents).
      // ВАЖНО: писать через sql.json(), НЕ через `${JSON.stringify(...)}::jsonb` —
      // postgres.js сериализует строковый параметр как jsonb-СТРОКУ, и каждое
      // следующее сохранение раздувает её экспоненциально (ловили 140 МБ на строку).
      // Селект защищён: испорченные гиганты не тянем в память, а сбрасываем.
      const scenarios = await sql<{ id: string; assumptions: unknown }[]>`
        select id,
          case
            when jsonb_typeof(assumptions) <> 'object' or length(assumptions::text) > 100000
              then '{}'::jsonb
            else assumptions
          end as assumptions
        from cashflow_scenarios where org_id = ${orgId}
      `;
      for (const s of scenarios) {
        const raw = s.assumptions;
        const a: Record<string, unknown> =
          raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
        const next = { ...a };
        if (typeof a.monthlyDeltaCents === "number") next.monthlyDeltaCents = Math.round(a.monthlyDeltaCents * mult);
        if (typeof a.oneOffCents === "number") next.oneOffCents = Math.round(a.oneOffCents * mult);
        await sql`update cashflow_scenarios set assumptions = ${sql.json(JSON.parse(JSON.stringify(next)))} where id = ${s.id}`;
      }
    }
    // Личное: «Остаток на счетах» = сумма ликвидных счетов в новой базе (счета сами в своих валютах).
    if (org?.type === "personal") await syncLiquidBalance(orgId);
  }
  return NextResponse.json({ ok: true });
}
