import { NextRequest, NextResponse } from "next/server";
import { answerFinancialQuestion } from "@/lib/chat/agent";
import { sql } from "@/lib/db";
import { getCurrentOrgId } from "@/lib/session";
import { getOrgPlan, getPersonalPlan } from "@/lib/billing/plan";
import { limit, withinLimit } from "@/lib/billing/entitlements";
import { limitP, withinLimitP } from "@/lib/billing/entitlements.personal";
import { getAccountContext } from "@/lib/account/context";
import { aiQuestionsThisMonth, saveChatMessage } from "@/lib/billing/usage";
import type { ChatTurn } from "@/lib/llm";

function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: ChatTurn[] = [];
  for (const m of raw) {
    if (
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
    ) {
      turns.push({ role: m.role, content: m.content });
    }
  }
  return turns.slice(-12);
}

export async function GET() {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const rows = await sql<{ role: "user" | "assistant"; content: string }[]>`
    select role, content from chat_messages
    where org_id = ${orgId}
      and created_at > coalesce(
        (select chat_cleared_at from organizations where id = ${orgId}),
        'epoch'::timestamptz
      )
    order by created_at asc
    limit 100
  `;
  return NextResponse.json({ messages: rows });
}

export async function DELETE() {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  await sql`update organizations set chat_cleared_at = now() where id = ${orgId}`;
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    history?: unknown;
  };
  if (!body.question?.trim()) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const ctx = await getAccountContext(orgId);
  const used = await aiQuestionsThisMonth(orgId);
  let max: number;
  let ok: boolean;
  if (ctx?.type === "personal") {
    const pplan = await getPersonalPlan(orgId);
    max = limitP(pplan, "aiQuestions");
    ok = withinLimitP(pplan, "aiQuestions", used);
  } else {
    const { plan } = await getOrgPlan(orgId);
    max = limit(plan, "aiQuestions");
    ok = withinLimit(plan, "aiQuestions", used);
  }
  if (!ok) {
    return NextResponse.json(
      { error: "limit_reached", limit: max, remaining: 0 },
      { status: 429 }
    );
  }

  const answer = await answerFinancialQuestion(
    orgId,
    body.question,
    sanitizeHistory(body.history)
  );

  await saveChatMessage(orgId, "user", body.question.trim());
  await saveChatMessage(orgId, "assistant", answer);

  const remaining = max === -1 ? -1 : Math.max(0, max - (used + 1));
  return NextResponse.json({ answer, remaining });
}
