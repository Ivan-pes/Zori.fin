import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/users";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ needsVerification: false });

  const user = await getUserByEmail(email);
  return NextResponse.json({ needsVerification: !!user && !user.emailVerified });
}
