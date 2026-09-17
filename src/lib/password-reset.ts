import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { env } from "./env";
import { sendEmail } from "./email";
import { emailShell } from "./email-template";
import { getUserByEmail } from "./users";

const TTL_MIN = 60;

export async function sendPasswordReset(email: string): Promise<void> {
  const e = email.toLowerCase().trim();
  const user = await getUserByEmail(e);
  if (!user) return;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MIN * 60_000);
  await sql`
    insert into password_reset_tokens (token, email, expires_at)
    values (${token}, ${e}, ${expiresAt})
  `;

  const link = `${env.APP_URL}/reset?token=${token}`;
  await sendEmail({
    to: e,
    subject: "Сброс пароля — Zori",
    text: `Вы запросили сброс пароля в Zori. Перейдите по ссылке (действует 1 час):\n${link}\n\nЕсли вы не запрашивали сброс — просто проигнорируйте это письмо.`,
    html: emailShell({
      preheader: "Ссылка для сброса пароля (действует 1 час).",
      heading: "Сброс пароля",
      subheading: "Вы запросили смену пароля в Zori",
      intro: "Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действует 1 час.",
      ctaUrl: link,
      ctaLabel: "Задать новый пароль",
      footnote: `Если кнопка не работает, откройте ссылку:<br><a href="${link}" style="color:#0E5A41;word-break:break-all">${link}</a><br><br>Если вы не запрашивали сброс — проигнорируйте это письмо, пароль останется прежним.`,
    }),
  });
}

export async function consumeResetToken(token: string): Promise<string | null> {
  const [row] = await sql<{ email: string; expires_at: Date }[]>`
    select email, expires_at from password_reset_tokens where token = ${token}
  `;
  if (!row) return null;
  await sql`delete from password_reset_tokens where token = ${token}`;
  if (row.expires_at < new Date()) return null;
  return row.email;
}
