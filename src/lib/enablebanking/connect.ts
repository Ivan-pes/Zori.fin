import { ebFetch } from "./client";
import { env } from "../env";

export interface Aspsp {
  name: string;
  country: string;
  logo?: string;
}

export async function listAspsps(country: string): Promise<Aspsp[]> {
  const c = (country || env.GOCARDLESS_COUNTRY).toUpperCase();
  const data = await ebFetch<{ aspsps: Aspsp[] }>(`/aspsps?country=${c}`);
  return data.aspsps ?? [];
}

export interface AuthStart {
  url: string;
  authorization_id: string;
}

export async function startAuth(opts: {
  aspspName: string;
  country: string;
  state: string;
  psuType?: "personal" | "business";
}): Promise<AuthStart> {
  const validUntil = new Date(Date.now() + 90 * 86_400_000).toISOString();
  return ebFetch<AuthStart>(`/auth`, {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: opts.aspspName, country: opts.country.toUpperCase() },
      state: opts.state,
      redirect_url: `${env.APP_URL}/api/bank/callback`,
      psu_type: opts.psuType ?? "business",
    }),
  });
}

export interface EbAccount {
  uid: string;
  name?: string;
  product?: string;
  currency?: string;
}
export interface Session {
  session_id: string;
  accounts: EbAccount[];
  aspsp?: { name?: string; country?: string };
}

export async function createSession(code: string): Promise<Session> {
  return ebFetch<Session>(`/sessions`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
