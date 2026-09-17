const DAY = 86_400_000;

export interface SafeToSpendInput {
  balanceCents: number;                  // текущий остаток на счетах
  expectedIncomeRemainingCents: number;  // ожидаемый доход до конца периода (зарплата)
  committedBillsCents: number;           // ещё не оплаченные обязательные счета в периоде
  budgetReservesCents: number;           // зарезервировано под бюджеты-конверты
  bufferCents: number;                   // неснижаемый остаток (safe_threshold_cents)
  periodEnd: Date;                       // конец периода (следующая зарплата / конец месяца)
  asOf: Date;                            // «сейчас»

  // ── Режим «% от дохода» (личный план трат) ────────────────────
  /** Месячный доход (зарплата) — база для плана трат. */
  monthlyIncomeCents?: number;
  /** «Тратить не больше N% дохода» (10..100). Если задан вместе с доходом —
   *  лимит = income × pct − потрачено, вместо автоформулы с резервом. */
  spendTargetPct?: number | null;
  /** Уже потрачено в этом месяце (без переводов и комиссий). */
  spentThisMonthCents?: number;
}

export interface SafeToSpendOptions {
  /** Доля свободных денег, которую придерживаем как подушку на непредвиденное (0..1). */
  prudenceReservePct?: number;
  /** Дневной лимит распределяется минимум на столько дней — чтобы в конце периода
   *  не рекомендовать «потратить всё за день». */
  minSpreadDays?: number;
}

export const DEFAULT_STS_OPTIONS: Required<SafeToSpendOptions> = {
  prudenceReservePct: 0.25,
  minSpreadDays: 7,
};

export interface SafeToSpend {
  totalCents: number;      // сколько можно потратить до конца периода (после резерва)
  perDayCents: number;     // разумный дневной лимит
  daysLeft: number;
  periodEnd: Date;
  committedCents: number;  // обязательные счета впереди
  bufferCents: number;
  reserveCents: number;    // придержано как подушка на непредвиденное
  /** Как посчитан лимит: target = «N% от дохода», auto = формула с резервом. */
  mode: "target" | "auto";
  /** Для mode=target: план трат месяца (income × pct) и уже потраченное. */
  spendTargetCents?: number;
  spentThisMonthCents?: number;
  /** target: план урезан до физически доступного (мало денег на счетах). */
  cappedByAvailable?: boolean;
  /** Входы формулы — чтобы UI мог показать «как посчитано». */
  balanceCents: number;
  expectedIncomeRemainingCents: number;
  monthlyIncomeCents?: number;
}

/**
 * Safe-to-Spend — ядро личного режима. Полностью детерминированно.
 *
 * Режим «target» (человек задал «тратить не больше N% дохода»):
 *   spendTarget = monthlyIncome × pct
 *   total       = max(0, min(spendTarget − spentThisMonth, physAvailable))
 *   — план трат, но не больше физически доступного (остаток − счета − буфер).
 *
 * Режим «auto» (процент не задан):
 *   available = balance + expectedIncomeRemaining − committedBills − budgetReserves − buffer
 *   total     = max(0, available) × (1 − prudenceReserve)   — не советуем тратить всё до нуля
 *
 * В обоих: perDay = total / max(daysLeft, minSpreadDays) — без «трать 4000 за день».
 */
export function computeSafeToSpend(
  input: SafeToSpendInput,
  opts: SafeToSpendOptions = {}
): SafeToSpend {
  const { prudenceReservePct, minSpreadDays } = { ...DEFAULT_STS_OPTIONS, ...opts };

  const available =
    input.balanceCents +
    input.expectedIncomeRemainingCents -
    input.committedBillsCents -
    input.budgetReservesCents -
    input.bufferCents;
  const physAvailable = Math.max(0, available);

  const msLeft = input.periodEnd.getTime() - input.asOf.getTime();
  const daysLeft = Math.max(1, Math.ceil(msLeft / DAY));

  const useTarget =
    input.spendTargetPct != null &&
    input.spendTargetPct > 0 &&
    (input.monthlyIncomeCents ?? 0) > 0;

  let totalCents: number;
  let reserveCents = 0;
  let spendTargetCents: number | undefined;
  let cappedByAvailable = false;

  if (useTarget) {
    spendTargetCents = Math.round(((input.monthlyIncomeCents ?? 0) * input.spendTargetPct!) / 100);
    const remaining = Math.max(0, spendTargetCents - (input.spentThisMonthCents ?? 0));
    // Физическим остатком урезаем ТОЛЬКО если он реально отслеживается (>0).
    // Если счета не заведены (баланс 0) — план по доходу это ориентир, не зануляем,
    // иначе «можно потратить» = 0 при заданном доходе, что сбивает с толку.
    const tracksBalance = input.balanceCents > 0;
    cappedByAvailable = tracksBalance && physAvailable < remaining;
    totalCents = tracksBalance ? Math.min(remaining, physAvailable) : remaining;
  } else {
    reserveCents = Math.round(physAvailable * prudenceReservePct);
    totalCents = physAvailable - reserveCents;
  }

  const perDayCents = Math.round(totalCents / Math.max(daysLeft, minSpreadDays));

  return {
    totalCents,
    perDayCents,
    daysLeft,
    periodEnd: input.periodEnd,
    committedCents: input.committedBillsCents,
    bufferCents: input.bufferCents,
    reserveCents,
    mode: useTarget ? "target" : "auto",
    spendTargetCents,
    spentThisMonthCents: input.spentThisMonthCents,
    cappedByAvailable,
    balanceCents: input.balanceCents,
    expectedIncomeRemainingCents: input.expectedIncomeRemainingCents,
    monthlyIncomeCents: input.monthlyIncomeCents,
  };
}
