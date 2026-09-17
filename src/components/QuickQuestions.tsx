"use client";

import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export function QuickQuestions({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const tr = translator(locale);
  const QS = [
    { e: "📊", q: tr("qq.1") },
    { e: "💸", q: tr("qq.2") },
    { e: "📈", q: tr("qq.3") },
    { e: "🔮", q: tr("qq.4") },
  ];
  return (
    <div className="suggest" style={{ flexDirection: "column", alignItems: "stretch" }}>
      {QS.map(({ e, q }) => (
        <button
          key={q}
          style={{ textAlign: "left" }}
          onClick={() => window.dispatchEvent(new CustomEvent("zori:ask", { detail: q }))}
        >
          {e} {q}
        </button>
      ))}
    </div>
  );
}
