"use client";

import { useState } from "react";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export function SendReportButton({ week, email, locale = DEFAULT_LOCALE }: { week: number; email: string; locale?: Locale }) {
  const tr = translator(locale);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    setState("sending");
    try {
      const r = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week }),
      });
      setState(r.ok ? "sent" : "error");
      if (r.ok) setTimeout(() => setState("idle"), 4000);
    } catch {
      setState("error");
    }
  }

  const label =
    state === "sending" ? tr("srb.sending") :
    state === "sent" ? tr("srb.sent") :
    state === "error" ? tr("srb.error") :
    tr("srb.send");

  return (
    <button
      className="btn btn-line btn-sm"
      onClick={send}
      disabled={state === "sending"}
      title={state === "sent" ? tr("srb.sentTitle", { email }) : tr("srb.sendTitle", { email })}
      style={state === "sent" ? { color: "var(--accent-ink)", borderColor: "#CDE5DC" } : undefined}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "-2px", marginRight: 6 }}>
        <path d="M4 4h16v16H4z" /><path d="m4 6 8 6 8-6" />
      </svg>
      {label}
    </button>
  );
}
