import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getUserByEmail, createUser } from "@/lib/users";
import { sendVerificationEmail } from "@/lib/verification";
import { startProTrial } from "@/lib/billing/plan";
import { isActionLimited, recordAction, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов"),
  businessName: z.string().trim().max(80).optional(),
  accountType: z.enum(["business", "personal"]).optional(),
});

export async function POST(req: NextRequest) {
  const ipKey = `register:${clientIp(req) ?? "unknown"}`;
  if (await isActionLimited(ipKey, 5, 60)) {
    return NextResponse.json(
      { error: "Слишком много попыток регистрации. Попробуйте позже." },
      { status: 429 }
    );
  }
  await recordAction(ipKey, clientIp(req));

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Введите корректный email и пароль от 8 символов" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await getUserByEmail(email);

  if (existing?.emailVerified) {
    return NextResponse.json(
      { error: "Пользователь с таким email уже зарегистрирован" },
      { status: 409 }
    );
  }

  if (!existing) {
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await createUser(email, passwordHash);
    const type = parsed.data.accountType === "personal" ? "personal" : "business";
    const orgName = parsed.data.businessName?.trim() || (type === "personal" ? "Мои финансы" : "Мой бизнес");
    const [org] = await sql<{ id: string }[]>`
      insert into organizations (owner_id, name, type) values (${user.id}, ${orgName}, ${type})
      returning id
    `;
    // Pro-триал — только для бизнеса; личное стартует на Free.
    if (org && type === "business") await startProTrial(org.id);
  }

  let emailSent = true;
  try {
    await sendVerificationEmail(email);
  } catch (err) {
    // Аккаунт уже создан — не роняем регистрацию из-за сбоя почты,
    // чтобы не терять клиента. Письмо можно переотправить кнопкой "Выслать снова".
    console.error("Не удалось отправить письмо подтверждения:", err);
    emailSent = false;
  }

  return NextResponse.json({ ok: true, needsVerification: true, emailSent });
}
