"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TITLES = {
  ru: "Скрыть — это не мой регулярный платёж",
  uk: "Приховати — це не мій регулярний платіж",
  en: "Hide — this is not my recurring payment",
  es: "Ocultar — no es mi pago recurrente",
} as const;

/**
 * Скрывает ложный авто-платёж (детектор ошибся): пишет merchantKey в
 * hidden_subscriptions → платёж исчезает из календаря, обзора, safe-to-spend и чата.
 */
export function HideBillButton({ matchKey, locale = "ru" }: { matchKey: string; locale?: keyof typeof TITLES }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function hide() {
    setBusy(true);
    try {
      await fetch("/api/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchKey }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="mm-del" onClick={hide} disabled={busy} title={TITLES[locale] ?? TITLES.ru} aria-label={TITLES[locale] ?? TITLES.ru}>
      ×
    </button>
  );
}
