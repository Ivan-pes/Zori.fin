import { NextRequest, NextResponse } from "next/server";


const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isExempt(pathname: string): boolean {
  return pathname.startsWith("/api/auth/") || pathname === "/api/billing/webhook";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") && MUTATING.has(req.method) && !isExempt(pathname)) {
    const origin = req.headers.get("origin");
    if (origin) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
      if (!originHost || originHost !== host) {
        return NextResponse.json({ error: "Запрос с недопустимого источника" }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
