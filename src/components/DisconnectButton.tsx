"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { clearAllAccess, clearAccess } from "@/lib/yaxi/flow-client";

export function DisconnectButton({
  target,
  externalAccountId,
  label,
  confirmText,
  locale = DEFAULT_LOCALE,
}: {
  target: "stripe" | "bank" | "statements" | "paypal";
  /** Конкретный банк (integrations.external_account_id, напр. `yaxi:<id>`). */
  externalAccountId?: string;
  label?: string;
  confirmText: string;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function disconnect() {
    if (!window.confirm(confirmText)) return;
    setLoading(true);
    try {
      await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, externalAccountId }),
      });
      // Стираем сохранённый в браузере доступ: конкретного банка или все.
      if (target === "bank") {
        if (externalAccountId) clearAccess(externalAccountId.replace(/^yaxi:/, ""));
        else clearAllAccess();
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="btn btn-line btn-sm"
      style={{ width: "100%", color: "var(--danger)", borderColor: "var(--line-2)" }}
      onClick={disconnect}
      disabled={loading}
    >
      {loading ? tr("int.disconnecting") : (label ?? tr("int.disconnect"))}
    </button>
  );
}
