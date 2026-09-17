import type { NormalizedTransaction } from "@/types";
import { detectRecurring } from "./recurring";
import { nextDueDate } from "./calendar";

export interface IncomeSource {
  label: string;
  amountCents: number;
  cadence: "weekly" | "monthly";
}

export interface IncomeProfile {
  recurringIncomeCents: number;      // регулярный доход в месяц (зарплата и пр.)
  nextPayday: Date | null;           // ближайшая ожидаемая зарплата
  expectedRemainingCents: number;    // сколько дохода ждём до конца периода
  sources: IncomeSource[];
}

/**
 * Профиль дохода: детектит регулярные поступления (зарплату) через тот же
 * детектор recurring, но по direction=income. Питает safe-to-spend и прогноз.
 */
export function computeIncomeProfile(
  txns: NormalizedTransaction[],
  opts: { asOf?: Date; periodEnd?: Date } = {}
): IncomeProfile {
  const asOf = opts.asOf ?? new Date();
  const recurring = detectRecurring(txns, { direction: "income", asOf: asOf.getTime() });

  const sources: IncomeSource[] = recurring.map((r) => ({
    label: r.merchant,
    amountCents: r.avgAmountCents,
    cadence: r.cadence,
  }));
  const recurringIncomeCents = recurring.reduce((s, r) => s + r.monthlyEstimateCents, 0);

  // Ближайшая зарплата — самая ранняя из следующих дат регулярных поступлений.
  let nextPayday: Date | null = null;
  for (const r of recurring) {
    const due = nextDueDate(r.lastChargeAt, r.cadence, asOf);
    if (!nextPayday || due < nextPayday) nextPayday = due;
  }

  // Доход, который ещё ждём до конца периода (до periodEnd, если задан).
  let expectedRemainingCents = 0;
  const horizon = opts.periodEnd ?? nextPayday;
  if (horizon) {
    for (const r of recurring) {
      const due = nextDueDate(r.lastChargeAt, r.cadence, asOf);
      if (due >= asOf && due <= horizon) expectedRemainingCents += r.avgAmountCents;
    }
  }

  return { recurringIncomeCents, nextPayday, expectedRemainingCents, sources };
}
