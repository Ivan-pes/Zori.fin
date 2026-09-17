import { env } from "../env";

const BASE = "https://bankaccountdata.gocardless.com/api/v2";

let cachedToken: { value: string; expiresAt: number } | null = null;

class GoCardlessError extends Error {}

function assertConfigured(): { id: string; key: string } {
  const id = env.GOCARDLESS_SECRET_ID;
  const key = env.GOCARDLESS_SECRET_KEY;
  if (!id || !key) {
    throw new GoCardlessError(
      "GoCardless не настроен: задайте GOCARDLESS_SECRET_ID и GOCARDLESS_SECRET_KEY"
    );
  }
  return { id, key };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const { id, key } = assertConfigured();
  const res = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ secret_id: id, secret_key: key }),
  });

  if (!res.ok) {
    throw new GoCardlessError(
      `GoCardless token error ${res.status}: ${await res.text()}`
    );
  }

  const data = (await res.json()) as { access: string; access_expires: number };
  cachedToken = {
    value: data.access,
    expiresAt: Date.now() + data.access_expires * 1000,
  };
  return data.access;
}

export async function gcFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    throw new GoCardlessError(
      `GoCardless ${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`
    );
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export { GoCardlessError };
