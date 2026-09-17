import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import { sql } from "./db";
import { sendEmail } from "./email";
import { emailShell } from "./email-template";

export { generateTotpSecret, generateTotp, verifyTotp, totpKeyUri } from "./totp";

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 200 });
}


const CODE_TTL_MIN = 10;
export type CodePurpose = "login" | "enable";

export async function issueEmailCode(email: string, purpose: CodePurpose): Promise<string> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);
  await sql`delete from login_codes where email = ${email} and purpose = ${purpose}`;
  await sql`
    insert into login_codes (email, code, purpose, expires_at)
    values (${email}, ${code}, ${purpose}, ${expiresAt})
  `;
  return code;
}

export async function verifyEmailCode(email: string, code: string, purpose: CodePurpose): Promise<boolean> {
  const t = code.replace(/\s/g, "");
  const [row] = await sql<{ code: string; expires_at: Date }[]>`
    select code, expires_at from login_codes
    where email = ${email} and purpose = ${purpose}
    order by created_at desc limit 1
  `;
  if (!row) return false;
  const ok = row.expires_at > new Date() && row.code === t;
  if (ok) await sql`delete from login_codes where email = ${email} and purpose = ${purpose}`;
  return ok;
}

export async function sendEmailCode(email: string, code: string, purpose: CodePurpose): Promise<void> {
  const heading = purpose === "login" ? "Код для входа" : "Подтверждение двухфакторной защиты";
  await sendEmail({
    to: email,
    subject: `${code} — код Zori`,
    text: `Ваш код подтверждения: ${code}\nДействует ${CODE_TTL_MIN} минут. Если вы не запрашивали код — проигнорируйте письмо.`,
    html: emailShell({
      preheader: `Код: ${code}`,
      heading,
      subheading: `Действует ${CODE_TTL_MIN} минут`,
      contentHtml: `<div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#16181C;background:#F4F2EC;border-radius:12px;padding:18px;text-align:center;margin:6px 0 8px">${code}</div>`,
      footnote: "Если вы не запрашивали этот код — просто проигнорируйте письмо, с аккаунтом всё в порядке.",
    }),
  });
}
