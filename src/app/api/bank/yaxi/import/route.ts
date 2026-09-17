import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyResultJwt } from "@/lib/yaxi/ticket";
import { buildTransactionRows, toCents } from "@/lib/yaxi/transactions";
import { categorizeTransactions } from "@/lib/categorize/run";
import { sql } from "@/lib/db";
import { yaxiEnabled } from "@/lib/env";
import { requireWritableOrg } from "@/lib/guard-write";
import { getOrgPlan } from "@/lib/billing/plan";
import { limit, withinLimit } from "@/lib/billing/entitlements";
import { activeIntegrationsCount } from "@/lib/billing/usage";

// Приём результатов YAXI-флоу с фронта: result-JWT подписаны нашим же
// HMAC-ключом (docs: verify.html) — проверяем подпись, exp и что ticketId
// был выпущен нами (cookie из /api/bank/yaxi/ticket).

const TICKETS_COOKIE = "yaxi_tix";

const bodySchema = z.object({
  connectionId: z.string().min(1).max(200),
  institutionName: z.string().min(1).max(200),
  accountsJwt: z.string().min(20).optional(),
  balancesJwt: z.string().min(20).optional(),
  transactionsJwts: z.array(z.string().min(20)).max(24).default([]),
});

// ── Формы данных YAXI (docs: accounts/balances/transactions.html) ─────────
// Маппинг операций (уникальность/порядок) вынесен в @/lib/yaxi/transactions.
interface YxAccountBalances {
  account?: { iban?: string };
  balances?: { amount?: string | number; currency?: string; balanceType?: string }[];
}

export async function POST(req: NextRequest) {
  if (!yaxiEnabled) {
    return NextResponse.json({ error: "bank integration disabled" }, { status: 503 });
  }
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const body = parsed.data;

  let issued: string[] = [];
  try {
    issued = JSON.parse(req.cookies.get(TICKETS_COOKIE)?.value ?? "[]");
    if (!Array.isArray(issued)) issued = [];
  } catch {
    issued = [];
  }
  const issuedSet = new Set(issued);

  const verify = (jwt: string) => {
    const result = verifyResultJwt(jwt);
    if (!issuedSet.has(result.ticketId)) {
      throw new Error(`ticket ${result.ticketId} was not issued by this session`);
    }
    return result;
  };

  try {
    // Новая интеграция? Проверяем лимит тарифа на количество подключений.
    const externalAccountId = `yaxi:${body.connectionId}`;
    const [existing] = await sql<{ id: string }[]>`
      select id from integrations
      where org_id = ${orgId} and provider = 'gocardless'
        and external_account_id = ${externalAccountId}
    `;
    if (!existing) {
      const { plan } = await getOrgPlan(orgId);
      if (!withinLimit(plan, "integrations", await activeIntegrationsCount(orgId))) {
        return NextResponse.json(
          { error: "limit_reached", scope: "sources", max: limit(plan, "integrations") },
          { status: 403 }
        );
      }
    }

    // ── Транзакции: только Booked, идемпотентная вставка ──────────────────
    // Собираем операции из всех JWT в один список (порядок банка сохраняется),
    // затем маппим — так уникальность и порядок считаются по всему набору.
    const rawTxns = body.transactionsJwts.flatMap((jwt) => {
      const result = verify(jwt);
      return Array.isArray(result.data) ? result.data : [];
    });
    let inserted = 0;
    for (const row of buildTransactionRows(rawTxns)) {
      // source='gocardless' — общий маркер «банк» (CHECK в схеме);
      // настоящий провайдер в raw и в metadata интеграции.
      const res = await sql`
        insert into transactions
          (org_id, source, external_account_id, external_id, kind, direction,
           gross_cents, fee_cents, net_cents, currency, occurred_at, description, raw)
        values
          (${orgId}, 'gocardless', ${externalAccountId}, ${row.externalId}, 'adjustment', ${row.direction},
           ${row.grossCents}, 0, ${row.netCents}, ${row.currency},
           ${row.occurredAt}, ${row.description}, ${sql.json(JSON.parse(JSON.stringify(row.raw)))})
        on conflict (org_id, source, external_id)
          do update set external_account_id = excluded.external_account_id
      `;
      inserted += res.count; // затронутые строки (upsert проставляет метку банка)
    }

    // ── Балансы: Expected (доступно) приоритетнее Booked; сумма по счетам ──
    let accountsSeen = 0;
    if (body.balancesJwt) {
      const result = verify(body.balancesJwt);
      const groups = (Array.isArray(result.data) ? result.data : []) as { balances?: YxAccountBalances[] }[];
      let total = 0;
      let have = false;
      for (const g of groups) {
        for (const ab of g.balances ?? []) {
          accountsSeen++;
          const list = ab.balances ?? [];
          const pick =
            list.find((b) => b.balanceType?.toLowerCase() === "expected") ??
            list.find((b) => b.balanceType?.toLowerCase() === "booked") ??
            list[0];
          const cents = toCents(pick?.amount);
          if (cents !== null) {
            total += cents;
            have = true;
          }
        }
      }
      if (have) {
        await sql`
          update organizations set current_balance_cents = ${total}
          where id = ${orgId}
        `;
      }
    }

    // Accounts-JWT (если прислан) — только валидация и метаданные (маскированные IBAN).
    let accountMeta: string[] = [];
    if (body.accountsJwt) {
      const result = verify(body.accountsJwt);
      const accounts = (Array.isArray(result.data) ? result.data : []) as { iban?: string }[];
      accountMeta = accounts
        .map((a) => a.iban ?? "")
        .filter(Boolean)
        .map((iban) => `${iban.slice(0, 4)}…${iban.slice(-4)}`);
    }

    await sql`
      insert into integrations
        (org_id, provider, external_account_id, scope, status, metadata, last_synced_at)
      values
        (${orgId}, 'gocardless', ${externalAccountId}, 'read_only', 'active',
         ${sql.json({
           provider: "yaxi",
           institution_name: body.institutionName,
           accounts: accountMeta,
         })}, now())
      on conflict (org_id, provider, external_account_id)
        do update set status = 'active', metadata = excluded.metadata, last_synced_at = now()
    `;

    await categorizeTransactions(orgId);

    const res = NextResponse.json({ inserted, accounts: accountsSeen });
    res.cookies.delete(TICKETS_COOKIE);
    return res;
  } catch (err) {
    console.error("yaxi import error:", err);
    return NextResponse.json({ error: "import failed" }, { status: 400 });
  }
}
