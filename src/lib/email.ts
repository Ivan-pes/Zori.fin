import { Resend } from "resend";
import { env } from "./env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface EmailOpts {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function parseFrom(from: string): { email: string; name?: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2]!.trim() };
  return { email: from.trim() };
}

async function sendViaSendGrid(opts: EmailOpts): Promise<void> {
  // Чистим ключ от пробелов/переводов строк и любых не-ASCII символов,
  // которые могли прилипнуть при копировании (иначе fetch падает на ByteString).
  const apiKey = (env.SENDGRID_API_KEY ?? "").replace(/[^\x21-\x7E]/g, "");
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: opts.to }] }],
      from: parseFrom(env.EMAIL_FROM),
      subject: opts.subject,
      content: [
        { type: "text/plain", value: opts.text },
        { type: "text/html", value: opts.html },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SendGrid ${res.status}: ${body.slice(0, 300)}`);
  }
}

export async function sendEmail(opts: EmailOpts): Promise<void> {
  if (env.SENDGRID_API_KEY) {
    await sendViaSendGrid(opts);
    return;
  }

  if (resend) {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    return;
  }

  console.log(`\n[email:dev] → ${opts.to} · "${opts.subject}"`);
  console.log(`[email:dev] ${opts.text}\n`);
}
