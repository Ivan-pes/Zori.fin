import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRates } from "@/lib/fx";

/**
 * Ежедневное обновление курсов валют (планировать на 00:00).
 * Принудительно тянет свежие курсы (frankfurter + НБУ для UAH) и прогревает кэш.
 * Защищено CRON_SECRET, как и остальные cron-эндпоинты.
 */
export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rates = await getRates({ force: true });
  return NextResponse.json({
    ok: true,
    day: new Date().toISOString().slice(0, 10),
    currencies: Object.keys(rates).length,
    usd: rates.USD,
    gbp: rates.GBP,
    uah: rates.UAH,
  });
}
