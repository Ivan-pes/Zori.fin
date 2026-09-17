import { sql } from "@/lib/db";

export type AccountType = "business" | "personal";

export interface PayCycle {
  kind: "monthly" | "biweekly" | "weekly";
  anchorDay: number | null;
  nextPayday: string | null;
}

export interface AccountContext {
  id: string;
  type: AccountType;
  household: boolean;
  baseCurrency: string;
  payCycle: PayCycle | null;
  balanceCents: number | null;
  bufferCents: number | null;
  /** Личный лимит трат: не больше N% дохода (null = автоформула). */
  spendTargetPct: number | null;
  /** Доход руками: зарплата и доп. доходы (null = автодетект из транзакций). */
  salaryCents: number | null;
  extraIncomeCents: number | null;
  /** День зарплаты (1..31); null = период до конца месяца при ручном доходе. */
  paydayDay: number | null;
}

interface Row {
  id: string;
  type: string | null;
  household: boolean | null;
  base_currency: string | null;
  pay_cycle: PayCycle | null;
  current_balance_cents: string | null;
  safe_threshold_cents: string | null;
  spend_target_pct: number | null;
  salary_cents: string | null;
  extra_income_cents: string | null;
  payday_day: number | null;
}

export async function getAccountContext(orgId: string): Promise<AccountContext | null> {
  const [row] = await sql<Row[]>`
    select id, type, household, base_currency, pay_cycle,
           current_balance_cents, safe_threshold_cents, spend_target_pct,
           salary_cents, extra_income_cents, payday_day
    from organizations where id = ${orgId}
  `;
  if (!row) return null;
  return {
    id: row.id,
    type: row.type === "personal" ? "personal" : "business",
    household: row.household === true,
    baseCurrency: row.base_currency ?? "EUR",
    payCycle: row.pay_cycle ?? null,
    balanceCents: row.current_balance_cents !== null ? Number(row.current_balance_cents) : null,
    bufferCents: row.safe_threshold_cents !== null ? Number(row.safe_threshold_cents) : null,
    spendTargetPct: row.spend_target_pct !== null ? Number(row.spend_target_pct) : null,
    salaryCents: row.salary_cents !== null ? Number(row.salary_cents) : null,
    extraIncomeCents: row.extra_income_cents !== null ? Number(row.extra_income_cents) : null,
    paydayDay: row.payday_day !== null ? Number(row.payday_day) : null,
  };
}

export function isPersonal(ctx: Pick<AccountContext, "type">): boolean {
  return ctx.type === "personal";
}
