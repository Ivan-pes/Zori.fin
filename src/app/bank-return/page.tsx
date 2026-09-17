import { getLocale } from "@/lib/i18n/server";
import { BankReturnClose } from "@/components/BankReturnClose";

// Страница возврата из банка (YAXI redirectUri). Банк приводит сюда вкладку
// после подтверждения доступа; если в localStorage есть снимок флоу —
// BankReturnClose сразу везёт на /app/integrations, где подключение
// продолжается с того же места. Публичная, данных не содержит.

const L = {
  ru: {
    title: "Готово — доступ подтверждён",
    body: "Сейчас вернёмся в Zori — подключение продолжится автоматически.",
    closing: "Возвращаемся в Zori…",
    back: "Вернуться в Zori",
  },
  en: {
    title: "Done — access confirmed",
    body: "Taking you back to Zori — the connection continues automatically.",
    closing: "Returning to Zori…",
    back: "Back to Zori",
  },
  es: {
    title: "Listo — acceso confirmado",
    body: "Volvemos a Zori — la conexión continúa automáticamente.",
    closing: "Volviendo a Zori…",
    back: "Volver a Zori",
  },
  uk: {
    title: "Готово — доступ підтверджено",
    body: "Зараз повернемось у Zori — підключення продовжиться автоматично.",
    closing: "Повертаємось у Zori…",
    back: "Повернутись у Zori",
  },
} as const;

export default async function BankReturnPage() {
  const locale = await getLocale();
  const t = L[locale] ?? L.ru;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <BankReturnClose />
      <div className="panel" style={{ maxWidth: 420, textAlign: "center", padding: "36px 28px" }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-line)",
            color: "var(--accent-ink)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 16px",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h1 style={{ fontFamily: "var(--font-fraunces), Georgia, serif", fontSize: 22, fontWeight: 600, marginBottom: 10 }}>
          {t.title}
        </h1>
        <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>{t.body}</p>
        <p className="cap" style={{ justifyContent: "center" }}>{t.closing}</p>
        {/* Запасной выход: если сюда занесло основную вкладку (банк дёрнул
            window.opener) или браузер не дал закрыться — путь назад в приложение. */}
        <a className="btn btn-line btn-sm" style={{ marginTop: 16 }} href="/app/integrations">
          {t.back}
        </a>
      </div>
    </div>
  );
}
