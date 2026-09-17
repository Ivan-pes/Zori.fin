// «Снимок» флоу подключения банка через YAXI.
// При SCA-редиректе мы уводим ТЕКУЩУЮ вкладку на страницу банка (так задумано
// YAXI для веб-приложений: «direct the user agent to the returned URL») —
// состояние страницы при этом гибнет, поэтому перед уходом сохраняем прогресс
// сюда, а по возврату на /bank-return продолжаем с confirm.
// localStorage, а не sessionStorage: на телефоне возврат из банка может
// открыться в новой вкладке, а sessionStorage — у каждой вкладки свой.
// Пароль сюда НЕ пишем никогда. ticket/context/session — опаковые значения
// YAXI со сроком жизни ~10 минут, снимок живёт не дольше.

export type FlowStage = "accounts" | "balances" | "transactions";

export interface FlowSnapshot {
  v: 1;
  ts: number;
  clientUrl: string | null;
  connectionId: string;
  institutionName: string;
  userId?: string;
  /** стадия, во время которой случился редирект */
  stage: FlowStage;
  /** тикет активного сервиса */
  ticket: string;
  /** base64 Redirect.context — для confirm по возврату */
  context: string;
  /** base64 YAXI-сессии (переиспользуется между сервисами) */
  session?: string;
  accounts?: { iban: string; currency?: string }[];
  accountsJwt?: string;
  balancesJwt?: string;
  txJwts: string[];
  txIndex: number;
}

const KEY = "zori:yaxi-flow";
const TTL_MS = 9 * 60 * 1000;

export function saveSnapshot(snap: FlowSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* приватный режим и т.п. — по возврату покажем «Попробовать снова» */
  }
}

export function peekSnapshot(): FlowSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as FlowSnapshot;
    if (snap?.v !== 1 || typeof snap.ts !== "number" || Date.now() - snap.ts > TTL_MS) {
      clearSnapshot();
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

/** Забрать снимок, удалив его: флоу продолжает ровно один инстанс. */
export function claimSnapshot(): FlowSnapshot | null {
  const snap = peekSnapshot();
  if (snap) clearSnapshot();
  return snap;
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function bytesToB64(bytes?: Uint8Array): string | undefined {
  if (!bytes) return undefined;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64ToBytes(s?: string): Uint8Array | undefined {
  if (!s) return undefined;
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
