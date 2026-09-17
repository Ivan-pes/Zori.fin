"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TITLES = {
  ru: "Удалить подписку",
  uk: "Видалити підписку",
  en: "Delete subscription",
  es: "Eliminar suscripción",
} as const;

/** Удаляет вручную добавленную подписку (manual_subscriptions) → исчезает из
 *  «Ближайших счетов», календаря и safe-to-spend. Как крестик у авто-платежей. */
export function RemoveManualSubButton({ manualId, locale = "ru" }: { manualId: string; locale?: keyof typeof TITLES }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await fetch("/api/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="mm-del" onClick={remove} disabled={busy} title={TITLES[locale] ?? TITLES.ru} aria-label={TITLES[locale] ?? TITLES.ru}>
      ×
    </button>
  );
}
