import { getPersonalOverview, getSubscriptions } from "@/lib/personal/data";
import { sendEmail } from "@/lib/email";
import { formatMoney } from "@/lib/format";
import { env } from "@/lib/env";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** Личный дайджест на почту (Plus). Возвращает 'sent' | 'skipped'. */
export async function sendPersonalDigest(orgId: string, ownerEmail: string | null, orgName: string): Promise<"sent" | "skipped"> {
  if (!ownerEmail) return "skipped";
  const ov = await getPersonalOverview(orgId);
  if (!ov) return "skipped";
  const subs = await getSubscriptions(orgId);
  const cur = ov.currency;
  const s = ov.savings;

  // Нечего показывать — не шлём пустое письмо.
  if (s.incomeCents === 0 && s.spendingCents === 0) return "skipped";

  const url = `${env.APP_URL}/app/reports`;
  const top = ov.breakdown.slice(0, 3);
  const subject = `Zori: твой денежный дайджест`;

  const topText = top.map((b) => `• ${b.category}: ${formatMoney(b.totalCents, cur)}`).join("\n");
  const subsText = subs && subs.summary.count > 0 ? `\nПодписки: ${subs.summary.count} на ${formatMoney(subs.summary.monthlyCents, cur)}/мес.` : "";
  const text =
    `Доход ${formatMoney(s.incomeCents, cur)}, траты ${formatMoney(s.spendingCents, cur)}, отложено ${formatMoney(s.savedCents, cur)} (норма ${s.ratePct}%).\n\n` +
    `Куда ушли деньги:\n${topText}${subsText}\n\nПодробнее в приложении:\n${url}\n\n— Zori`;

  const topHtml = top
    .map((b) => `<div style="display:flex;justify-content:space-between;font-size:14px;padding:4px 0"><span>${escapeHtml(b.category)}</span><b>${formatMoney(b.totalCents, cur)}</b></div>`)
    .join("");
  const html = `
  <div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;color:#16181C">
    <div style="font-size:20px;font-weight:600;color:#1F7A5C;margin-bottom:18px">Zori</div>
    <div style="font-size:16px;font-weight:600;margin-bottom:12px">Твой денежный дайджест</div>
    <div style="background:#E7F1ED;border-radius:14px;padding:16px 18px;margin-bottom:18px;font-size:14px;line-height:1.6">
      Доход <b>${formatMoney(s.incomeCents, cur)}</b> · траты <b>${formatMoney(s.spendingCents, cur)}</b><br>
      Отложено <b style="color:#0E5A41">${formatMoney(s.savedCents, cur)}</b> (норма ${s.ratePct}%)
    </div>
    <div style="font-size:13px;font-weight:600;color:#8A8D96;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Куда ушли деньги</div>
    ${topHtml}
    ${subs && subs.summary.count > 0 ? `<div style="font-size:13px;color:#5E3B10;margin-top:12px">Подписки: ${subs.summary.count} на ${formatMoney(subs.summary.monthlyCents, cur)}/мес${subs.summary.staleCount > 0 ? `, из них ${subs.summary.staleCount} «зомби»` : ""}.</div>` : ""}
    <a href="${url}" style="display:inline-block;margin-top:20px;background:#1F7A5C;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">Открыть Zori →</a>
    <div style="font-size:12px;color:#8A8D96;margin-top:22px">Дайджест приходит по твоей настройке в Zori. Отключить — в Настройки → Уведомления.</div>
  </div>`;

  await sendEmail({ to: ownerEmail, subject, html, text });
  return "sent";
}
