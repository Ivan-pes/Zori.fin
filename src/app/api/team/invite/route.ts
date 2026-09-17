import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireOwnerOrg } from "@/lib/guard-write";
import { getOrgPlan, getPersonalPlan } from "@/lib/billing/plan";
import { limit, withinLimit } from "@/lib/billing/entitlements";
import { canP, limitP } from "@/lib/billing/entitlements.personal";
import { isActionLimited, recordAction, clientIp } from "@/lib/rate-limit";
import { isValidMemberLabel } from "@/lib/team-labels";
import { getUserByEmail } from "@/lib/users";
import { sendEmail } from "@/lib/email";
import { emailShell } from "@/lib/email-template";
import { translator } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n";
import { env } from "@/lib/env";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const guard = await requireOwnerOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Письма уходят с нашего домена — без лимита это спам-вектор.
  const rateKey = `invite:${orgId}`;
  if (await isActionLimited(rateKey, 10, 60)) {
    return NextResponse.json(
      { error: "Слишком много приглашений подряд. Попробуйте через час." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string; label?: string };
  const email = (body.email ?? "").toLowerCase().trim();
  const role = body.role === "viewer" ? "viewer" : "finance";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  }

  const [org] = await sql<{ name: string; type: string | null; locale: string | null }[]>`
    select name, type, locale from organizations where id = ${orgId}
  `;
  const isPersonal = org?.type === "personal";
  // Подпись «кто это» (сын/дочь/бухгалтер…) — только из известного набора.
  const label = body.label && isValidMemberLabel(body.label, isPersonal) ? body.label : null;

  // Занятые места считаем без приглашаемого: повторное приглашение / смена
  // роли существующего участника не занимает новое место.
  const [cnt] = await sql<{ n: number }[]>`
    select count(*)::int as n from memberships
    where org_id = ${orgId} and status in ('invited','active') and lower(email) <> ${email}
  `;
  const used = 1 + (cnt?.n ?? 0);

  if (isPersonal) {
    // Семейный бюджет (household): гейт по личному тарифу, а не по бизнес-сетке.
    const personalPlan = await getPersonalPlan(orgId);
    if (!canP(personalPlan, "household")) {
      return NextResponse.json(
        { error: "Семейный бюджет доступен на тарифе Plus. Обновите тариф, чтобы пригласить близких." },
        { status: 403 }
      );
    }
    const seats = 1 + limitP(personalPlan, "householdMembers");
    if (used >= seats) {
      return NextResponse.json(
        { error: `Лимит участников семейного бюджета исчерпан (${seats}).` },
        { status: 403 }
      );
    }
  } else {
    const { plan } = await getOrgPlan(orgId);
    if (!withinLimit(plan, "teamSeats", used)) {
      return NextResponse.json(
        { error: `Лимит мест в команде исчерпан (${limit(plan, "teamSeats")}). Обновите тариф.` },
        { status: 403 }
      );
    }
  }

  // Повторное приглашение активного участника не сбрасывает его в invited —
  // обновляются только роль и подпись (доступ не прерывается).
  const [member] = await sql<{ id: string; email: string; role: string; status: string; label: string | null }[]>`
    insert into memberships (org_id, email, role, status, label)
    values (${orgId}, ${email}, ${role}, 'invited', ${label})
    on conflict (org_id, email) do update
      set role = excluded.role,
          label = coalesce(excluded.label, memberships.label),
          status = case when memberships.status = 'active' then 'active' else 'invited' end
    returning id, email, role, status, label
  `;
  await recordAction(rateKey, clientIp(req));

  // Уже активному участнику письмо «зарегистрируйтесь» не нужно.
  if (member?.status === "active") {
    return NextResponse.json({ ok: true, member });
  }

  try {
    // Язык письма — из настроек пространства (settings → язык).
    const locale: Locale = isLocale(org?.locale) ? org!.locale as Locale : "ru";
    const t = translator(locale);
    // У человека уже есть аккаунт? Тогда ведём на вход, а не на регистрацию:
    // приглашение привяжется само при первом же заходе.
    const existing = !!(await getUserByEmail(email));
    // flow=personal и на /signin: кнопка «Зарегистрироваться» на странице входа
    // передаёт его дальше в регистрацию (сразу режим «Для себя»).
    const link = existing
      ? `${env.APP_URL}/signin?invite=${encodeURIComponent(email)}${isPersonal ? "&flow=personal" : ""}`
      : `${env.APP_URL}/register?invite=${encodeURIComponent(email)}${isPersonal ? "&flow=personal" : ""}`;
    const intro = existing
      ? t("mail.inv.introExisting", { email })
      : t(isPersonal ? "mail.inv.introNewFam" : "mail.inv.introNewBiz", { email });
    await sendEmail({
      to: email,
      subject: t(isPersonal ? "mail.inv.subjectFam" : "mail.inv.subjectBiz"),
      text: `${intro} ${link}`,
      html: emailShell({
        locale,
        preheader: t(isPersonal ? "mail.inv.preFam" : "mail.inv.preBiz"),
        heading: t(isPersonal ? "mail.inv.headFam" : "mail.inv.headBiz"),
        subheading: isPersonal ? t("mail.inv.subFam", { name: org?.name ?? "Zori" }) : t("mail.inv.subBiz"),
        intro,
        ctaUrl: link,
        ctaLabel: t(existing ? "mail.inv.ctaExisting" : "mail.inv.ctaNew"),
        footnote: t("mail.inv.foot"),
      }),
    });
  } catch (err) {
    console.error("team invite email failed:", err);
  }

  return NextResponse.json({ ok: true, member });
}
