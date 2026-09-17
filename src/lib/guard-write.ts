import { NextResponse } from "next/server";
import { getCurrentMembership, canWrite } from "./session";

export async function requireWritableOrg(): Promise<{ orgId: string } | { error: NextResponse }> {
  const m = await getCurrentMembership();
  if (!m) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!canWrite(m.role)) {
    return {
      error: NextResponse.json(
        { error: "Роль «Просмотр» не может изменять данные — только чтение." },
        { status: 403 }
      ),
    };
  }
  return { orgId: m.orgId };
}

// Зона владельца: команда, тариф, тип пространства, интеграции.
// Партнёр/бухгалтер (finance) ведёт финансы, но не администрирует аккаунт.
export async function requireOwnerOrg(): Promise<{ orgId: string } | { error: NextResponse }> {
  const m = await getCurrentMembership();
  if (!m) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (m.role !== "owner") {
    return {
      error: NextResponse.json(
        { error: "Это может делать только владелец пространства." },
        { status: 403 }
      ),
    };
  }
  return { orgId: m.orgId };
}
