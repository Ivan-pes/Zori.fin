import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/verification";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const email = token ? await verifyToken(token) : null;

  const dest = email ? "/signin?verified=1" : "/signin?error=verify";
  return NextResponse.redirect(`${env.APP_URL}${dest}`);
}
