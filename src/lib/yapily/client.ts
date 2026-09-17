import { env } from "../env";

// Yapily (console.yapily.com): Basic-auth парой applicationUuid:secret на каждый
// запрос, отдельного token-эндпоинта нет. Данные счетов — с заголовком Consent.
const BASE = "https://api.yapily.com";

class YapilyError extends Error {}

function authHeader(): string {
  const id = env.YAPILY_APPLICATION_UUID;
  const secret = env.YAPILY_APPLICATION_SECRET;
  if (!id || !secret) {
    throw new YapilyError(
      "Yapily не настроен: задайте YAPILY_APPLICATION_UUID и YAPILY_APPLICATION_SECRET"
    );
  }
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export async function ypFetch<T>(
  path: string,
  init: RequestInit = {},
  consent?: string
): Promise<T> {
  // links.next в пагинации приходит абсолютным URL — поддерживаем оба вида.
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(consent ? { Consent: consent } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    throw new YapilyError(
      `Yapily ${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`
    );
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export { YapilyError };
