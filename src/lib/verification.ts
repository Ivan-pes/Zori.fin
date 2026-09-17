import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { env } from "./env";
import { sendEmail } from "./email";
import { emailShell } from "./email-template";

const TTL_HOURS = 24;

export async function sendVerificationEmail(email: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600_000);

  await sql`
    insert into email_verification_tokens (token, email, expires_at)
    values (${token}, ${email}, ${expiresAt})
  `;

  const link = `${env.APP_URL}/api/auth/verify?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Подтвердите email — Zori",
    text: `Подтвердите ваш email в Zori, перейдя по ссылке (действует 24 часа):\n${link}`,
    html: html(link),
  });
}

export async function verifyToken(token: string): Promise<string | null> {
  const [row] = await sql<{ email: string; expires_at: Date }[]>`
    select email, expires_at from email_verification_tokens where token = ${token}
  `;
  if (!row) return null;

  await sql`delete from email_verification_tokens where token = ${token}`;
  if (row.expires_at < new Date()) return null;

  await sql`update users set email_verified = now() where email = ${row.email}`;
  return row.email;
}

function html(link: string): string {
  return emailShell({
    preheader: "Подтвердите ваш email, чтобы начать пользоваться Zori.",
    heading: "Подтвердите email",
    subheading: "Остался один шаг до входа в Zori",
    intro: "Нажмите кнопку ниже, чтобы подтвердить адрес и активировать аккаунт. Ссылка действует 24 часа.",
    ctaUrl: link,
    ctaLabel: "Подтвердить email",
    footnote: `Если кнопка не работает, скопируйте ссылку в браузер:<br><a href="${link}" style="color:#0E5A41;word-break:break-all">${link}</a><br><br>Если вы не регистрировались в Zori — просто проигнорируйте это письмо.`,
  });
}
