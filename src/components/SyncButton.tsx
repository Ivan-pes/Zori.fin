"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export function SyncButton({ endpoint = "/api/stripe/sync", locale = DEFAULT_LOCALE }: { endpoint?: string; locale?: Locale }) {
  const tr = translator(locale);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function sync() {
    setLoading(true);
    try {
      await fetch(endpoint, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-line" onClick={sync} disabled={loading}>
      {loading ? tr("int.syncing") : tr("int.syncNow")}
    </button>
  );
}
