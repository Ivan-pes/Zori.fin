import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../env";

// YAXI (docs.yaxi.tech): бэкенд выпускает «сервисные тикеты» — JWT HS256,
// подписанные секретом приложения (base64), с kid в заголовке. Результаты
// сервисов возвращаются тоже как JWT с тем же HMAC-ключом: проверяем подпись,
// exp и совпадение ticketId с выпущенным нами тикетом.
//
// Формат тикета (docs: getting-started):
//   header  { alg: "HS256", typ: "JWT", kid: <KEY_ID> }
//   payload { data: { service, id: <uuid>, data?: <вход сервиса> }, exp } — exp ≤ 15 минут.

export type YaxiService = "Accounts" | "Balances" | "Transactions";

const TICKET_TTL_SECS = 600; // 10 минут (максимум YAXI — 15)

class YaxiError extends Error {}

function hmacKey(): Buffer {
  if (!env.YAXI_SECRET_KEY) {
    throw new YaxiError("YAXI не настроен: задайте YAXI_KEY_ID и YAXI_SECRET_KEY");
  }
  return Buffer.from(env.YAXI_SECRET_KEY, "base64");
}

function b64url(input: Buffer | string): string {
  return (typeof input === "string" ? Buffer.from(input, "utf8") : input).toString("base64url");
}

function sign(headerAndPayload: string): string {
  return createHmac("sha256", hmacKey()).update(headerAndPayload).digest("base64url");
}

export interface IssuedTicket {
  ticket: string;
  ticketId: string;
}

export function issueTicket(service: YaxiService, data?: unknown): IssuedTicket {
  if (!env.YAXI_KEY_ID) {
    throw new YaxiError("YAXI не настроен: задайте YAXI_KEY_ID и YAXI_SECRET_KEY");
  }
  const ticketId = randomUUID();
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: env.YAXI_KEY_ID }));
  // ВАЖНО: поле data.data обязано присутствовать всегда (для Accounts/Balances —
  // как null), иначе сервер отвечает TicketException INVALID (проверено живьём).
  const payload = b64url(
    JSON.stringify({
      data: {
        service,
        id: ticketId,
        data: data ?? null,
      },
      exp: Math.floor(Date.now() / 1000) + TICKET_TTL_SECS,
    })
  );
  return { ticket: `${header}.${payload}.${sign(`${header}.${payload}`)}`, ticketId };
}

export interface YaxiResult {
  ticketId: string;
  timestamp?: string;
  data: unknown;
}

// Проверка result-JWT от YAXI (docs: verify.html): HS256 нашим ключом,
// затем сверка ticketId с выпущенными тикетами делается на уровне маршрута.
export function verifyResultJwt(jwt: string): YaxiResult {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new YaxiError("Bad JWT format");
  const [h, p, s] = parts as [string, string, string];

  const expected = Buffer.from(sign(`${h}.${p}`), "base64url");
  const given = Buffer.from(s, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new YaxiError("Bad JWT signature");
  }

  let header: { alg?: string };
  let payload: { data?: { ticketId?: string; timestamp?: string; data?: unknown }; exp?: number };
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    throw new YaxiError("Bad JWT payload");
  }
  if (header.alg !== "HS256") throw new YaxiError("Unexpected JWT alg");
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now() - 60_000) {
    throw new YaxiError("JWT expired");
  }

  const data = payload.data;
  if (!data || typeof data.ticketId !== "string") throw new YaxiError("Missing ticketId");
  return { ticketId: data.ticketId, timestamp: data.timestamp, data: data.data };
}

// URL среды для фронтового клиента: production — дефолт клиента (null),
// integration — тестовая среда YAXI.
export function yaxiClientUrl(): string | null {
  return env.YAXI_ENV === "integration" ? "https://integration.yaxi.tech/" : null;
}

export { YaxiError };
