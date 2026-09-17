import { sql } from "@/lib/db";

function monthStart(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
}

export async function aiQuestionsThisMonth(orgId: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from chat_messages
    where org_id = ${orgId} and role = 'user' and created_at >= ${monthStart()}
  `;
  return r?.n ?? 0;
}

export async function statementImportsThisMonth(orgId: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from import_log
    where org_id = ${orgId} and created_at >= ${monthStart()}
  `;
  return r?.n ?? 0;
}

export async function activeIntegrationsCount(orgId: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from integrations where org_id = ${orgId} and status = 'active'
  `;
  return r?.n ?? 0;
}

export async function logImport(orgId: string, kind: "csv" | "pdf" | "receipt"): Promise<void> {
  await sql`insert into import_log (org_id, kind) values (${orgId}, ${kind})`;
}

export async function saveChatMessage(
  orgId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await sql`insert into chat_messages (org_id, role, content) values (${orgId}, ${role}, ${content})`;
}
