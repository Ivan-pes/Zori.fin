"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, getClientLocale, type Locale } from "@/lib/i18n";

export default function ForgotPage() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => setLocale(getClientLocale()), []);
  const tr = translator(locale);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <div className="glow" />
        <div className="brand"><div className="logo">Z</div>Zori</div>
        <div className="auth-quote">
          <h2>{tr("au.fgQuote")}</h2>
          <p>{tr("au.fgQuoteSub")}</p>
        </div>
      </aside>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={onSubmit}>
          <h1>{tr("au.fgTitle")}</h1>
          <p className="sub">{tr("au.fgSub")}</p>

          {sent ? (
            <>
              <p style={{ color: "var(--accent-ink)", background: "var(--accent-soft)", fontSize: 13.5, padding: "12px 14px", borderRadius: 10, marginBottom: 16, lineHeight: 1.5 }}>
                {tr("au.fgSent")}
              </p>
              <Link href="/signin" className="btn btn-dark" style={{ width: "100%" }}>{tr("au.backToSignin")}</Link>
            </>
          ) : (
            <>
              <div className="field">
                <label>Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
              </div>
              <button type="submit" className="btn btn-dark" style={{ width: "100%" }} disabled={loading || !email.trim()}>
                {loading ? tr("au.sending") : tr("au.sendLink")}
              </button>
            </>
          )}

          <p className="auth-foot">{tr("au.rememberedQ")} <Link href="/signin">{tr("au.signIn")}</Link></p>
        </form>
      </div>
    </div>
  );
}
