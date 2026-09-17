import { sql } from "@/lib/db";
import { loadTransactions } from "@/lib/transactions";
import { computePnL, expenseBreakdown } from "@/lib/metrics/engine";
import { forecastCashFlow } from "@/lib/metrics/forecast";
import { sendEmail } from "@/lib/email";
import { emailShell } from "@/lib/email-template";
import { formatMoney } from "@/lib/format";
import { getLLM } from "@/lib/llm";
import { env } from "@/lib/env";
import type { PnL } from "@/types";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
export const MAX_WEEKS_BACK = 12;

interface ReportOrg {
  id: string;
  name: string;
  current_balance_cents: string | null;
  safe_threshold_cents: string | null;
}
export interface ReportOrgRow extends ReportOrg {
  owner_email: string | null;
}

export interface ReportData {
  orgName: string;
  periodLabel: string;
  weekOffset: number;
  hasActivity: boolean;
  prevHasActivity: boolean;
  pnl: PnL;
  prevPnl: PnL;
  topExpenses: Array<{ label: string; totalCents: number }>;
  gapDate: string | null;
  gapBalanceCents: number | null;
  thresholdCents: number;
}

export interface BuiltReport {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type ReportResult = "sent" | "skipped";

export async function computeReportData(org: ReportOrg, weekOffset = 0): Promise<ReportData> {
  const now = new Date();
  const to = new Date(now.getTime() - weekOffset * WEEK_MS);
  const from = new Date(to.getTime() - WEEK_MS);
  const prevFrom = new Date(from.getTime() - WEEK_MS);

  const thisWeek = await loadTransactions(org.id, { from, to });
  const prevWeek = await loadTransactions(org.id, { from: prevFrom, to: from });

  const pnl = computePnL(thisWeek);
  const prevPnl = computePnL(prevWeek);
  const topExpenses = expenseBreakdown(thisWeek).slice(0, 3);

  let gapDate: string | null = null;
  let gapBalanceCents: number | null = null;
  let thresholdCents = 0;
  if (weekOffset === 0 && org.current_balance_cents !== null) {
    thresholdCents = org.safe_threshold_cents === null ? 0 : Number(org.safe_threshold_cents);
    const lookback = await loadTransactions(org.id, { from: new Date(now.getTime() - 30 * DAY_MS), to: now });
    const f = forecastCashFlow(lookback, Number(org.current_balance_cents), {
      horizonDays: 30,
      thresholdCents,
      lookbackDays: 30,
    });
    gapDate = f.gapDate;
    gapBalanceCents = f.gapBalanceCents;
  }

  return {
    orgName: org.name,
    periodLabel: formatPeriod(from, to),
    weekOffset,
    hasActivity: thisWeek.length > 0,
    prevHasActivity: prevWeek.length > 0,
    pnl,
    prevPnl,
    topExpenses,
    gapDate,
    gapBalanceCents,
    thresholdCents,
  };
}

export async function generateReportSummary(d: ReportData): Promise<string> {
  const cur = d.pnl.currency;
  const facts = [
    `Бизнес: ${d.orgName}`,
    `Период: ${d.periodLabel}`,
    `Выручка: ${formatMoney(d.pnl.netRevenueCents, cur)} (прошлая неделя: ${formatMoney(d.prevPnl.netRevenueCents, cur)})`,
    `Чистая прибыль: ${formatMoney(d.pnl.profitCents, cur)}, маржа ${d.pnl.marginPct.toFixed(0)}%`,
    `Расходы всего: ${formatMoney(d.pnl.totalExpenseCents, cur)}`,
    `Топ расходов: ${d.topExpenses.map((e) => `${e.label} — ${formatMoney(e.totalCents, cur)}`).join("; ") || "нет"}`,
    d.gapDate
      ? `ВАЖНО: прогнозируется кассовый разрыв ${formatGapDate(d.gapDate)} (остаток упадёт до ~${formatMoney(d.gapBalanceCents ?? 0, cur)})`
      : `Кассовый разрыв в ближайшие 30 дней не прогнозируется`,
  ].join("\n");

  try {
    return await getLLM().complete({
      system:
        "Ты — Zori, AI-финансовый помощник для малого бизнеса. По данным за неделю напиши тёплую, " +
        "конкретную сводку в 2–3 коротких предложениях на русском: что произошло и на что обратить внимание. " +
        "Без markdown и заголовков, простым языком. НЕ выдумывай числа сверх предоставленных.",
      messages: [{ role: "user", content: facts }],
      tools: [],
      executeTool: async () => "",
      maxIterations: 1,
    });
  } catch (err) {
    console.error("[weekly-report] AI-сводка не удалась, беру запасной текст:", err);
    return fallbackSummary(d);
  }
}

export async function getCachedReportSummary(
  orgId: string,
  weekOffset: number,
  data: ReportData,
  opts: { force?: boolean } = {}
): Promise<{ summary: string; generatedAt: string }> {
  const fp = fingerprint(data);

  if (!opts.force) {
    const [cached] = await sql<{ summary: string; fingerprint: string; generated_at: Date }[]>`
      select summary, fingerprint, generated_at from report_summaries
      where org_id = ${orgId} and week_offset = ${weekOffset}
    `;
    if (cached && cached.fingerprint === fp && isSameDay(cached.generated_at)) {
      return { summary: cached.summary, generatedAt: cached.generated_at.toISOString() };
    }
  }

  const summary = await generateReportSummary(data);
  const [row] = await sql<{ generated_at: Date }[]>`
    insert into report_summaries (org_id, week_offset, summary, fingerprint, generated_at)
    values (${orgId}, ${weekOffset}, ${summary}, ${fp}, now())
    on conflict (org_id, week_offset)
      do update set summary = excluded.summary, fingerprint = excluded.fingerprint, generated_at = now()
    returning generated_at
  `;
  return { summary, generatedAt: (row?.generated_at ?? new Date()).toISOString() };
}

function fingerprint(d: ReportData): string {
  return [
    d.pnl.netRevenueCents,
    d.pnl.totalExpenseCents,
    d.pnl.feeCents,
    d.topExpenses.length,
    d.gapDate ?? "",
  ].join(":");
}

function isSameDay(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export async function buildWeeklyReport(org: ReportOrgRow): Promise<BuiltReport | null> {
  if (!org.owner_email) return null;
  const data = await computeReportData(org, 0);
  if (!data.hasActivity && !data.prevHasActivity) return null;
  const summary = await generateReportSummary(data);
  return { to: org.owner_email, ...renderEmail(data, summary) };
}

export async function sendWeeklyReport(org: ReportOrgRow): Promise<ReportResult> {
  const report = await buildWeeklyReport(org);
  if (!report) return "skipped";
  await sendEmail({ to: report.to, subject: report.subject, html: report.html, text: report.text });
  return "sent";
}

export async function sendReportForWeek(org: ReportOrgRow, weekOffset = 0): Promise<ReportResult> {
  if (!org.owner_email) return "skipped";
  const data = await computeReportData(org, weekOffset);
  const summary = await generateReportSummary(data);
  const { subject, html, text } = renderEmail(data, summary);
  await sendEmail({ to: org.owner_email, subject, html, text });
  return "sent";
}

function formatPeriod(from: Date, to: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${fmt(from)} – ${fmt(to)}`;
}

export function formatGapDate(iso: string, tag = "ru-RU"): string {
  return new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "long" });
}

export function deltaPct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function deltaLabel(cur: number, prev: number, suffix = "к прошлой неделе"): string {
  const d = deltaPct(cur, prev);
  if (d === null) return "";
  const arrow = d >= 0 ? "▲" : "▼";
  return `${arrow} ${d >= 0 ? "+" : ""}${d.toFixed(0)}% ${suffix}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

function fallbackSummary(d: ReportData): string {
  const cur = d.pnl.currency;
  const base = `За неделю выручка составила ${formatMoney(d.pnl.netRevenueCents, cur)}, чистая прибыль — ${formatMoney(
    d.pnl.profitCents,
    cur
  )} (маржа ${d.pnl.marginPct.toFixed(0)}%).`;
  const cash = d.gapDate
    ? ` Внимание: прогнозируется кассовый разрыв ${formatGapDate(d.gapDate)} — стоит заранее перенести крупные выплаты.`
    : ` Кассовых разрывов в ближайшие 30 дней не прогнозируется.`;
  return base + cash;
}

function renderEmail(d: ReportData, summary: string): { subject: string; html: string; text: string } {
  const cur = d.pnl.currency;
  const subject = `Zori · сводка за неделю (${d.periodLabel})`;
  const url = `${env.APP_URL}/app/reports`;

  const rows = [
    { label: "Выручка", value: formatMoney(d.pnl.netRevenueCents, cur), delta: deltaLabel(d.pnl.netRevenueCents, d.prevPnl.netRevenueCents) },
    { label: "Чистая прибыль", value: `${formatMoney(d.pnl.profitCents, cur)} · маржа ${d.pnl.marginPct.toFixed(0)}%`, delta: deltaLabel(d.pnl.profitCents, d.prevPnl.profitCents) },
    { label: "Расходы", value: formatMoney(d.pnl.totalExpenseCents, cur), delta: deltaLabel(d.pnl.totalExpenseCents, d.prevPnl.totalExpenseCents) },
  ];

  const text =
    `Zori — сводка за неделю (${d.periodLabel}) для «${d.orgName}»\n\n` +
    `${summary}\n\n` +
    rows.map((r) => `• ${r.label}: ${r.value}${r.delta ? ` (${r.delta})` : ""}`).join("\n") +
    (d.topExpenses.length
      ? `\n\nТоп расходов:\n` + d.topExpenses.map((e) => `• ${e.label}: ${formatMoney(e.totalCents, cur)}`).join("\n")
      : "") +
    `\n\nОткрыть отчёты: ${url}\n\n— Zori`;

  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #ECEAE3;font-size:14px;color:#52555E">${r.label}</td>
        <td style="padding:10px 0;border-bottom:1px solid #ECEAE3;font-size:14px;font-weight:600;text-align:right">${r.value}${
          r.delta ? `<div style="font-size:12px;font-weight:500;color:#8A8D96;margin-top:2px">${r.delta}</div>` : ""
        }</td>
      </tr>`
    )
    .join("");

  const topHtml = d.topExpenses.length
    ? `<div style="font-size:13px;font-weight:600;color:#8A8D96;text-transform:uppercase;letter-spacing:.05em;margin:22px 0 8px">Куда уходят деньги</div>` +
      d.topExpenses
        .map(
          (e) =>
            `<div style="display:flex;justify-content:space-between;font-size:14px;padding:5px 0"><span style="color:#52555E">${escapeHtml(
              e.label
            )}</span><b>${formatMoney(e.totalCents, cur)}</b></div>`
        )
        .join("")
    : "";

  const gapHtml = d.gapDate
    ? `<div style="background:#F6ECDD;border:1px solid #EBD7BC;border-radius:12px;padding:12px 15px;margin-top:18px;font-size:13.5px;color:#7A4E18">⚠️ Прогнозируется кассовый разрыв <b>${formatGapDate(
        d.gapDate
      )}</b> — остаток упадёт до ~${formatMoney(d.gapBalanceCents ?? 0, cur)}.</div>`
    : "";

  const contentHtml = `
    <div style="background:#E7F1ED;border:1px solid #CDE6DC;border-radius:14px;padding:16px 18px;font-size:14.5px;line-height:1.55;color:#2E5C4C;margin-bottom:20px">${escapeHtml(summary)}</div>
    <table style="width:100%;border-collapse:collapse">${rowsHtml}</table>
    ${topHtml}
    ${gapHtml}
    <div style="height:22px"></div>`;

  const html = emailShell({
    preheader: `Выручка ${formatMoney(d.pnl.netRevenueCents, cur)} · прибыль ${formatMoney(d.pnl.profitCents, cur)} за неделю`,
    heading: "Сводка за неделю",
    subheading: `${d.periodLabel} · «${d.orgName}»`,
    contentHtml,
    ctaUrl: url,
    ctaLabel: "Открыть отчёты →",
    footnote: "Цифры посчитаны по вашим операциям; прогноз ориентировочный. Настроить частоту писем можно в Настройках → Уведомления.",
  });

  return { subject, html, text };
}
