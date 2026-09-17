import { sql } from "./db";
import { sendEmail } from "./email";
import { emailShell } from "./email-template";
import { translator } from "./i18n/dictionaries";
import { isLocale, type Locale } from "./i18n";
import { env } from "./env";

export async function activateInvitesForUser(userId: string, email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (!userId || !normalized) return;
  const activated = await sql<{ org_id: string; role: string }[]>`
    update memberships
    set status = 'active', user_id = ${userId}
    where lower(email) = ${normalized} and status = 'invited'
    returning org_id, role
  `;
  if (activated.length === 0) return;

  // Security-сигнал владельцу: в пространстве появился новый человек.
  // Письмо не должно ронять вход — любые сбои только логируем.
  try {
    const orgs = await sql<{ id: string; name: string; type: string | null; locale: string | null; owner_email: string }[]>`
      select o.id, o.name, o.type, o.locale, u.email as owner_email
      from organizations o
      join users u on u.id = o.owner_id
      where o.id = any(${activated.map((a) => a.org_id)})
    `;
    for (const org of orgs) {
      const role = activated.find((a) => a.org_id === org.id)?.role ?? "finance";
      const locale: Locale = isLocale(org.locale) ? org.locale : "ru";
      const t = translator(locale);
      const roleLabel =
        role === "viewer" ? t("set.roleViewer") : org.type === "personal" ? t("set.rolePartner") : t("set.roleFinance");
      const settingsUrl = `${env.APP_URL}/app/settings`;
      const intro = t("mail.acc.intro", { email: normalized, role: roleLabel });
      await sendEmail({
        to: org.owner_email,
        subject: t("mail.acc.subject", { email: normalized }),
        text: `${intro} ${settingsUrl}`,
        html: emailShell({
          locale,
          preheader: t("mail.acc.pre", { name: org.name }),
          heading: t("mail.acc.head"),
          subheading: t("mail.acc.sub", { name: org.name }),
          intro,
          ctaUrl: settingsUrl,
          ctaLabel: t("mail.acc.cta"),
          footnote: t("mail.acc.foot"),
        }),
      });
    }
  } catch (err) {
    console.error("invite acceptance notification failed:", err);
  }
}
