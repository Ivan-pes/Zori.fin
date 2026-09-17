"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { silentBankSync } from "@/lib/yaxi/silent-sync";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

// Тихий фоновый синк банков при заходе в приложение. Смонтирован в Sidebar (на
// всех страницах /app). Данные обновляются сами, если пора; никаких модалок.
// «Живой банкинг»: обновляем часто (каждые 30 мин при заходе). Если банк
// потребовал переподтверждения (needs-interaction) или упал — откатываемся к
// длинной паузе, чтобы не спамить подсказкой. Троттлинг — per-банк.

const STALE_MS = 30 * 60 * 1000;
const BACKOFF_MS = 6 * 60 * 60 * 1000;
const ATTEMPT_KEY = "zori:yaxi-sync-attempt:";
const BACKOFF_KEY = "zori:yaxi-sync-backoff:";

// Одна попытка на загрузку страницы (StrictMode двойной маунт + ремаунты при
// переходах между разделами SPA).
let ranThisLoad = false;

function readTs(key: string): number {
  try {
    return Number(localStorage.getItem(key) || 0);
  } catch {
    return 0;
  }
}
function writeTs(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* приватный режим — просто без троттлинга */
  }
}

export interface SyncBank {
  connectionId: string;
  institutionName: string;
  lastSyncedMs: number | null;
}

export function SilentBankSync({
  banks,
  clientUrl,
  locale = DEFAULT_LOCALE,
}: {
  banks: SyncBank[];
  clientUrl: string | null;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "needs">("idle");
  const startedRef = useRef(false);

  useEffect(() => {
    if (ranThisLoad || startedRef.current) return;
    const now = Date.now();

    // Отбираем банки, которые пора обновить (per-банк троттл и backoff).
    const due = banks.filter((b) => {
      if (now - readTs(BACKOFF_KEY + b.connectionId) < BACKOFF_MS) return false;
      const fresh = b.lastSyncedMs != null && now - b.lastSyncedMs < STALE_MS;
      if (fresh || now - readTs(ATTEMPT_KEY + b.connectionId) < STALE_MS) return false;
      return true;
    });
    if (due.length === 0) return;

    startedRef.current = true;
    ranThisLoad = true;

    setState("syncing");
    (async () => {
      let anyOk = false;
      let anyNeeds = false;
      for (const b of due) {
        writeTs(ATTEMPT_KEY + b.connectionId, now);
        const r = await silentBankSync({
          connectionId: b.connectionId,
          institutionName: b.institutionName,
          clientUrl,
        });
        if (r === "ok") {
          anyOk = true;
        } else if (r === "needs-interaction") {
          anyNeeds = true;
          writeTs(BACKOFF_KEY + b.connectionId, now); // не приставать 6ч
        } else {
          writeTs(BACKOFF_KEY + b.connectionId, now); // ошибка — тоже отступаем
        }
      }
      setState(anyNeeds ? "needs" : "idle");
      if (anyOk) router.refresh(); // подтянуть свежие данные в серверные компоненты
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "idle") return null;

  return (
    <div className="yx-sync-toast" role="status">
      {state === "syncing" ? (
        <>
          <span className="yx-spin" />
          <span>{tr("int.silentSyncing")}</span>
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
          <span>{tr("int.silentNeedsReconnect")}</span>
          <a className="btn btn-accent btn-sm" href="/app/integrations">{tr("int.bankRefresh")}</a>
          <button className="yx-sync-x" aria-label="✕" onClick={() => setState("idle")}>✕</button>
        </>
      )}
    </div>
  );
}
