import type { NormalizedTransaction } from "@/types";
import { sql } from "@/lib/db";
import { computePnL } from "./engine";
import { getBaseCurrency } from "@/lib/transactions";
import { getRates, convertCents } from "@/lib/fx";

const RETENTION_MONTHS = 18;

export interface SaaSMetrics {
  mrrCents: number;
  prevMrrCents: number;
  activeClients: number;
  arpuCents: number;
  ltvCents: number;
  retentionMonths: number;
  currency: string;
  churnPct?: number;
  source: "subscriptions" | "estimate";
}

export function computeSaaSMetrics(
  monthTxns: NormalizedTransaction[],
  prevMonthTxns: NormalizedTransaction[]
): SaaSMetrics {
  const pnl = computePnL(monthTxns);
  const prev = computePnL(prevMonthTxns);
  const activeClients = monthTxns.filter((t) => t.kind === "charge").length;
  const mrrCents = pnl.netRevenueCents;
  const arpuCents = activeClients > 0 ? Math.round(mrrCents / activeClients) : 0;

  return {
    mrrCents,
    prevMrrCents: prev.netRevenueCents,
    activeClients,
    arpuCents,
    ltvCents: arpuCents * RETENTION_MONTHS,
    retentionMonths: RETENTION_MONTHS,
    currency: pnl.currency,
    source: "estimate",
  };
}

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

interface SubRow {
  customer_id: string | null;
  amount_cents: string;
  currency: string | null;
  interval: string | null;
  interval_count: number;
  status: string;
  started_at: Date | null;
  canceled_at: Date | null;
}

function toMonthlyCents(amountCents: number, interval: string | null, count: number): number {
  const perMonth: Record<string, number> = { day: 30, week: 52 / 12, month: 1, year: 1 / 12 };
  const factor = (perMonth[interval ?? "month"] ?? 1) / Math.max(count, 1);
  return Math.round(amountCents * factor);
}

export async function loadSubscriptionMetrics(orgId: string): Promise<SaaSMetrics | null> {
  const rows = await sql<SubRow[]>`
    select customer_id, amount_cents, currency, interval, interval_count, status, started_at, canceled_at
    from stripe_subscriptions where org_id = ${orgId}
  `;
  if (rows.length === 0) return null;

  const base = await getBaseCurrency(orgId);
  const rates = await getRates();

  const now = Date.now();
  const monthAgo = now - 30 * 86_400_000;

  let mrrCents = 0;
  let prevMrrCents = 0;
  let prevActive = 0;
  let canceledLast30 = 0;
  const customers = new Set<string>();

  for (const r of rows) {
    const amountBase = convertCents(Number(r.amount_cents), r.currency ?? "EUR", base, rates);
    const monthly = toMonthlyCents(amountBase, r.interval, r.interval_count);
    const active = ACTIVE_STATUSES.has(r.status);
    if (active) {
      mrrCents += monthly;
      if (r.customer_id) customers.add(r.customer_id);
    }
    const startedMs = r.started_at ? r.started_at.getTime() : now;
    const canceledMs = r.canceled_at ? r.canceled_at.getTime() : null;
    const wasActiveMonthAgo = startedMs <= monthAgo && (canceledMs === null || canceledMs > monthAgo);
    if (wasActiveMonthAgo) {
      prevMrrCents += monthly;
      prevActive += 1;
    }
    if (canceledMs !== null && canceledMs >= monthAgo) canceledLast30 += 1;
  }

  const activeClients = customers.size;
  const arpuCents = activeClients > 0 ? Math.round(mrrCents / activeClients) : 0;
  const churnPct = prevActive > 0 ? (canceledLast30 / prevActive) * 100 : 0;
  const retentionMonths = churnPct > 0 ? Math.round(100 / churnPct) : 36;
  const ltvCents = churnPct > 0 ? Math.round(arpuCents / (churnPct / 100)) : arpuCents * 36;

  return {
    mrrCents,
    prevMrrCents,
    activeClients,
    arpuCents,
    ltvCents,
    retentionMonths,
    currency: base,
    churnPct,
    source: "subscriptions",
  };
}

export interface ReportInsight {
  tone: "ok" | "warn" | "info";
  title: string;
  text: string;
}

type InsightT = (key: string, vars?: Record<string, string | number>) => string;

export function reportInsights(opts: {
  marginPct: number;
  profitCents: number;
  activeClients: number;
  hasExpensesBeyondFees: boolean;
  t?: InsightT;
}): ReportInsight[] {
  const t: InsightT = opts.t ?? ((k) => k);
  const out: ReportInsight[] = [];

  if (opts.marginPct >= 50 && opts.profitCents > 0) {
    out.push({ tone: "ok", title: t("ins.strongTitle"), text: t("ins.marginHigh", { m: opts.marginPct.toFixed(0) }) });
  } else if (opts.profitCents > 0) {
    out.push({ tone: "ok", title: t("ins.strongTitle"), text: t("ins.profitPos", { m: opts.marginPct.toFixed(0) }) });
  } else {
    out.push({ tone: "ok", title: t("ins.obsTitle"), text: t("ins.lossText") });
  }

  if (opts.activeClients > 0 && opts.activeClients <= 3) {
    out.push({ tone: "warn", title: t("ins.concTitle"), text: t("ins.concText", { n: opts.activeClients }) });
  } else {
    out.push({ tone: "warn", title: t("ins.watchTitle"), text: t("ins.watchText") });
  }

  out.push({
    tone: "info",
    title: t("ins.recTitle"),
    text: opts.hasExpensesBeyondFees ? t("ins.recCat") : t("ins.recConnect"),
  });

  return out;
}
