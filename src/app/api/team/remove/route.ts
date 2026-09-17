import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireOwnerOrg } from "@/lib/guard-write";

export async function POST(req: NextRequest) {
  const guard = await requireOwnerOrg();
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  await sql`update memberships set status = 'revoked' where id = ${id} and org_id = ${orgId}`;
  return NextResponse.json({ ok: true });
}
