import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateTotpSecret, totpKeyUri, qrDataUrl } from "@/lib/twofa";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const secret = generateTotpSecret();
  const uri = totpKeyUri(session.user.email, secret);
  const qr = await qrDataUrl(uri);
  return NextResponse.json({ secret, qr });
}
