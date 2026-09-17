"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { silentBankSync } from "@/lib/yaxi/silent-sync";
import { DisconnectButton } from "@/components/DisconnectButton";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

// Карточка одного живого банка (мультибанк). «Обновить» — тихий синк именно
// этого подключения; «Удалить» — сносит только этот банк и его операции.
export function BankCard({
  connectionId,
  externalAccountId,
  institutionName,
  txCount,
  syncLabel,
  connectedLabel = null,
  fresh = false,
  clientUrl,
  disconnectConfirm,
  locale = DEFAULT_LOCALE,
}: {
  connectionId: string;
  externalAccountId: string;
  institutionName: string;
  txCount: number;
  /** Когда данные обновлялись в последний раз (относительно, напр. «5 минут назад»). */
  syncLabel: string | null;
  /** Когда банк был подключён (дата). */
  connectedLabel?: string | null;
  /** Обновление свежее (≤24 ч) — показываем зелёную точку. */
  fresh?: boolean;
  clientUrl: string | null;
  disconnectConfirm: string;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "ok" | "needs" | "error">("idle");

  async function refresh() {
    setState("syncing");
    const r = await silentBankSync({ connectionId, institutionName, clientUrl });
    if (r === "ok") {
      setState("ok");
      router.refresh();
    } else if (r === "needs-interaction" || r === "no-creds") {
      setState("needs");
    } else {
      setState("error");
    }
  }

  return (
    <div className="bank-card">
      <div className="bank-card-main">
        <span className="bank-ic">{institutionName.slice(0, 1).toUpperCase()}</span>
        <div className="bank-card-txt">
          <b>{institutionName}</b>
          <div className="cap">{tr("int.bankCardMeta", { n: txCount, sync: "" })}</div>
          {connectedLabel && <div className="cap">{tr("int.bankConnectedAt", { date: connectedLabel })}</div>}
          {syncLabel && (
            <div className="cap cap-sync">
              {tr("int.bankUpdatedAt", { date: syncLabel })}
              {fresh && <i className="sync-dot" aria-hidden="true" />}
            </div>
          )}
        </div>
      </div>
      {state === "needs" && <div className="note warn" style={{ margin: "2px 0" }}><span>{tr("int.silentNeedsReconnect")}</span></div>}
      {state === "error" && <div className="note warn" style={{ margin: "2px 0" }}><span>{tr("int.errGeneric")}</span></div>}
      <div className="bank-card-actions">
        <button className="btn btn-line btn-sm" onClick={refresh} disabled={state === "syncing"}>
          {state === "syncing" ? tr("int.silentSyncing") : state === "ok" ? tr("int.bankRefreshed") : tr("int.bankRefresh")}
        </button>
        <DisconnectButton
          target="bank"
          externalAccountId={externalAccountId}
          confirmText={disconnectConfirm}
          label={tr("int.remove")}
          locale={locale}
        />
      </div>
    </div>
  );
}
