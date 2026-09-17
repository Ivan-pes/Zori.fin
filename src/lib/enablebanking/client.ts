import { createSign } from "node:crypto";
import { env } from "../env";

const BASE = "https://api.enablebanking.com";

class EnableBankingError extends Error {}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function privateKeyPem(): string {
  const raw = env.ENABLEBANKING_PRIVATE_KEY ?? "";
  if (raw.includes("-----BEGIN")) return raw.replace(/\\n/g, "\n");
  return Buffer.from(raw, "base64").toString("utf8");
}

let cached: { value: string; exp: number } | null = null;

function buildJwt(): string {
  const appId = env.ENABLEBANKING_APP_ID;
  if (!appId || !env.ENABLEBANKING_PRIVATE_KEY) {
    throw new EnableBankingError(
      "Enable Banking не настроен: задайте ENABLEBANKING_APP_ID и ENABLEBANKING_PRIVATE_KEY"
    );
  }
  if (cached && cached.exp > Date.now() + 60_000) return cached.value;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const header = { typ: "JWT", alg: "RS256", kid: appId };
  const payload = { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp };
  const data = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  const sig = createSign("RSA-SHA256").update(data).sign(privateKeyPem());
  const jwt = `${data}.${b64url(sig)}`;
  cached = { value: jwt, exp: exp * 1000 };
  return jwt;
}

export async function ebFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${buildJwt()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new EnableBankingError(
      `EnableBanking ${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`
    );
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export { EnableBankingError };
