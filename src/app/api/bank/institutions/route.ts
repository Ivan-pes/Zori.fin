import { NextRequest, NextResponse } from "next/server";
import { listAspsps } from "@/lib/enablebanking/connect";
import { listInstitutions, institutionLogo } from "@/lib/yapily/connect";
import { getCurrentUserId } from "@/lib/session";
import { bankEnabled, yapilyEnabled, env } from "@/lib/env";

export async function GET(req: NextRequest) {
  if (!bankEnabled) {
    return NextResponse.json({ error: "bank integration disabled" }, { status: 503 });
  }
  if (!(await getCurrentUserId())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const country = (req.nextUrl.searchParams.get("country") || env.GOCARDLESS_COUNTRY).toUpperCase();
  try {
    if (yapilyEnabled) {
      const institutions = await listInstitutions(country);
      return NextResponse.json({
        country,
        institutions: institutions.map((i) => ({
          id: i.id,
          name: i.environmentType === "SANDBOX" ? `${i.name} · sandbox` : i.name,
          bic: null,
          logo: institutionLogo(i),
        })),
      });
    }

    const aspsps = await listAspsps(country);
    return NextResponse.json({
      country,
      institutions: aspsps.map((a) => ({
        id: a.name,
        name: a.name,
        bic: null,
        logo: a.logo ?? null,
      })),
    });
  } catch (err) {
    console.error("bank institutions error:", err);
    return NextResponse.json({ error: "failed to load banks" }, { status: 502 });
  }
}
