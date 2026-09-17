import { sql } from "@/lib/db";
import { loadTransactions } from "@/lib/transactions";
import { forecastCashFlow, type CashForecast } from "@/lib/metrics/forecast";
import { sendEmail } from "@/lib/email";
import { formatMoney } from "@/lib/format";
import { env } from "@/lib/env";

const HORIZON_DAYS = 30;
const LOOKBACK_DAYS = 30;

export interface AlertOrgRow {
  id: string;
  name: string;
  current_balance_cents: string | null;
  safe_threshold_cents: string | null;
  last_alerted_gap_date: string | null;
  owner_email: string | null;
}

export type AlertResult = "sent" | "cleared" | "skipped";

export async function checkOrgCashGap(org: AlertOrgRow, personal = false): Promise<AlertResult> {
  if (org.current_balance_cents === null) return "skipped";

  const now = new Date();
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const to = new Date(now.getTime() + 86_400_000);
  const txns = await loadTransactions(org.id, { from, to });

  const thresholdCents =
    org.safe_threshold_cents === null ? 0 : Number(org.safe_threshold_cents);
  const forecast = forecastCashFlow(txns, Number(org.current_balance_cents), {
    horizonDays: HORIZON_DAYS,
    thresholdCents,
    lookbackDays: LOOKBACK_DAYS,
  });

  if (!forecast.gapDate) {
    if (org.last_alerted_gap_date) {
      await sql`update organizations set last_alerted_gap_date = null where id = ${org.id}`;
    }
    return "cleared";
  }

  if (org.last_alerted_gap_date === forecast.gapDate) return "skipped";

  await sql`
    update organizations set last_alerted_gap_date = ${forecast.gapDate}
    where id = ${org.id}
  `;

  if (!org.owner_email) return "skipped";

  await sendGapAlertEmail(org.owner_email, org.name, forecast, personal);
  return "sent";
}

function formatGapDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
}

async function sendGapAlertEmail(to: string, orgName: string, f: CashForecast, personal = false): Promise<void> {
  const when = formatGapDate(f.gapDate!);
  const gap = formatMoney(f.gapBalanceCents ?? 0);
  const belowThreshold =
    f.thresholdCents > 0 ? ` — ниже безопасного порога ${formatMoney(f.thresholdCents)}` : "";
  const url = `${env.APP_URL}/app`;
  const heading = personal ? "Мало на счету" : "Прогнозируется кассовый разрыв";
  const subject = personal ? `⚠️ Zori: мало на счету к ${when}` : `⚠️ Zori: прогнозируется кассовый разрыв ${when}`;

  const text =
    (personal
      ? `Zori предупреждает: к ${when} на счетах останется примерно ${gap}${belowThreshold}.\n\n`
      : `Zori прогнозирует кассовый разрыв для «${orgName}».\n\nК ${when} остаток опустится примерно до ${gap}${belowThreshold}.\n\n`) +
    `Откройте приложение, чтобы посмотреть детали:\n${url}\n\n— Zori`;

  const safeName = escapeHtml(orgName);
  const bodyLine = personal
    ? `К <strong>${when}</strong> на счетах останется примерно <strong>${gap}</strong>${belowThreshold}. Крупные траты сейчас лучше отложить.`
    : `Для «${safeName}» к <strong>${when}</strong> остаток опустится примерно до <strong>${gap}</strong>${belowThreshold}.`;
  const html = `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;color:#16181C">
    <div style="font-size:20px;font-weight:600;color:#1F7A5C;margin-bottom:18px">Zori</div>
    <div style="background:#F6ECDD;border:1px solid #EBD7BC;border-radius:14px;padding:18px 20px;margin-bottom:20px">
      <div style="font-weight:600;font-size:16px;margin-bottom:8px">⚠️ ${heading}</div>
      <div style="font-size:14px;line-height:1.55;color:#5E3B10">
        ${bodyLine}
      </div>
    </div>
    <a href="${url}" style="display:inline-block;background:#1F7A5C;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">Открыть Zori →</a>
    <div style="font-size:12px;color:#8A8D96;margin-top:22px;line-height:1.5">
      Автоматическое уведомление от Zori. Прогноз ориентировочный — основан на средней динамике ваших операций.
    </div>
  </div>`;

  await sendEmail({ to, subject, html, text });
}
