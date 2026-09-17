"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export function SignOutButton({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const tr = translator(locale);
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut({ redirect: false });
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      style={{
        padding: "8px 14px",
        border: "1px solid #ddd",
        borderRadius: 10,
        background: "#fff",
        fontSize: 14,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? `${tr("common.signout")}…` : tr("common.signout")}
    </button>
  );
}
