import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { issueTicket, yaxiClientUrl } from "@/lib/yaxi/ticket";
import { requireWritableOrg } from "@/lib/guard-write";
import { yaxiEnabled } from "@/lib/env";

// Выпуск сервисного тикета YAXI для фронтового флоу (routex-client).
// ticketId кладём в httpOnly-cookie: /api/bank/yaxi/import примет только
// результаты по тикетам, которые выпускали мы в этой же сессии браузера.

const TICKETS_COOKIE = "yaxi_tix";
const MAX_TRACKED = 24;

const bodySchema = z.discriminatedUnion("service", [
  z.object({ service: z.literal("Accounts") }),
  z.object({ service: z.literal("Balances") }),
  z.object({
    service: z.literal("Transactions"),
    data: z.object({
      account: z.object({ iban: z.string().min(5), currency: z.string().length(3).optional() }),
      range: z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    }),
  }),
]);

export async function POST(req: NextRequest) {
  if (!yaxiEnabled) {
    return NextResponse.json({ error: "bank integration disabled" }, { status: 503 });
  }
  const guard = await requireWritableOrg();
  if ("error" in guard) return guard.error;
  if (!guard.orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const body = parsed.data;

  const issued = issueTicket(body.service, body.service === "Transactions" ? body.data : undefined);

  // Копим id выпущенных тикетов (для одного флоу их несколько: Accounts,
  // Balances и по одному Transactions на счёт).
  let tracked: string[] = [];
  try {
    tracked = JSON.parse(req.cookies.get(TICKETS_COOKIE)?.value ?? "[]");
    if (!Array.isArray(tracked)) tracked = [];
  } catch {
    tracked = [];
  }
  tracked = [...tracked.filter((t) => typeof t === "string"), issued.ticketId].slice(-MAX_TRACKED);

  const res = NextResponse.json({
    ticket: issued.ticket,
    ticketId: issued.ticketId,
    clientUrl: yaxiClientUrl(),
  });
  res.cookies.set(TICKETS_COOKIE, JSON.stringify(tracked), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 900,
    path: "/",
  });
  return res;
}
