import { NextRequest, NextResponse } from "next/server";
import { getAccessibleOrgs, ACTIVE_ORG_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { orgId?: string };
  const orgId = (body.orgId ?? "").trim();
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const orgs = await getAccessibleOrgs();
  if (orgs.length === 0) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!orgs.some((o) => o.id === orgId)) {
    return NextResponse.json({ error: "no access to this organization" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
