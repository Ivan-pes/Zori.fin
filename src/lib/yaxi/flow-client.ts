"use client";

import { storeCredentials, loadCredentials, removeCredentials, clearCredentials, type Credentials } from "routex-client";
import { b64ToBytes, bytesToB64 } from "./flow-snapshot";

// Общие клиентские хелперы флоу YAXI: их делят интерактивная модалка
// (YaxiConnect) и тихий фоновый синк (silent-sync).

export interface TicketRes {
  ticket: string;
  ticketId: string;
  clientUrl: string | null;
}

export async function fetchTicket(service: string, data?: unknown): Promise<TicketRes> {
  const res = await fetch("/api/bank/yaxi/ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data !== undefined ? { service, data } : { service }),
  });
  if (!res.ok) throw new Error(`ticket ${res.status}`);
  return res.json();
}

// Result-JWT: полезные данные лежат в data.data (docs: verify.html).
export function decodeJwtData(jwt: string): unknown {
  const part = jwt.split(".")[1] ?? "";
  const bytes = Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  return (JSON.parse(new TextDecoder().decode(bytes)) as { data?: { data?: unknown } })?.data?.data;
}

// ── Сохранённый доступ к банку (в браузере, шифруется userSecret через YAXI) ──

// Что кладём в браузер. connectionData — опаковый «токен» повторного доступа от
// банка (без пароля); если банк его даёт, тихий синк проходит без SCA. Uint8Array
// не сериализуется в JSON, поэтому храним base64 и восстанавливаем при загрузке.
interface StoredAccess {
  userId?: string;
  password?: string;
  connectionData?: string; // base64
}

// userSecret отдаёт наш бэкенд (/api/bank/yaxi/secret) — только владельцу сессии.
export async function fetchUserSecret(): Promise<Uint8Array | null> {
  const res = await fetch("/api/bank/yaxi/secret");
  if (!res.ok) return null;
  const { userSecret } = (await res.json()) as { userSecret?: string };
  if (!userSecret) return null;
  return Uint8Array.from(atob(userSecret), (c) => c.charCodeAt(0));
}

export function saveAccess(
  connectionId: string,
  userSecret: Uint8Array,
  creds: { userId?: string; password?: string; connectionData?: Uint8Array }
): void {
  const stored: StoredAccess = {
    userId: creds.userId,
    password: creds.password,
    connectionData: bytesToB64(creds.connectionData),
  };
  storeCredentials(connectionId, userSecret, stored);
}

export function loadAccess(connectionId: string, userSecret: Uint8Array): Credentials | null {
  let raw: unknown;
  try {
    raw = loadCredentials(connectionId, userSecret);
  } catch {
    return null; // нет записи или чужой ключ
  }
  if (!raw || typeof raw !== "object") return null;
  const s = raw as StoredAccess;
  return {
    connectionId,
    userId: s.userId,
    password: s.password,
    connectionData: b64ToBytes(s.connectionData),
  };
}

export function clearAccess(connectionId: string): void {
  try {
    removeCredentials(connectionId);
  } catch {
    /* ignore */
  }
}

// При отключении банка connectionId на клиенте неизвестен (кнопка общая) —
// стираем весь сохранённый банковский доступ из браузера.
export function clearAllAccess(): void {
  try {
    clearCredentials();
  } catch {
    /* ignore */
  }
}
