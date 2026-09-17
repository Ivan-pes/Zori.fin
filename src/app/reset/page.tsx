"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, getClientLocale, type Locale } from "@/lib/i18n";

export default function ResetPage() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => setLocale(getClientLocale()), []);
  const tr = translator(locale);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(tr("au.pwMin8"));
    if (password !== confirm) return setError(tr("au.pwMismatch"));
    setLoading(true);
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? tr("au.pwChangeFail"));
        setLoading(false);
        return;
      }
      router.push("/signin?reset=1");
    } catch {
      setError(tr("au.netErr"));
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <div className="glow" />
        <div className="brand"><div className="logo">Z</div>Zori</div>
        <div className="auth-quote">
          <h2>{tr("au.rsQuote")}</h2>
          <p>{tr("au.rsQuoteSub")}</p>
        </div>
      </aside>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={onSubmit}>
          <h1>{tr("au.rsTitle")}</h1>
          <p className="sub">{tr("au.rsSub")}</p>

          {!token ? (
            <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>
              {tr("au.rsBadLinkPre")}{" "}
              <Link href="/forgot" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{tr("au.rsBadLinkLink")}</Link>.
            </p>
          ) : (
            <>
              <div className="field">
                <label>{tr("au.newPw")}</label>
                <input type="password" required value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} placeholder={tr("au.min8")} autoFocus />
              </div>
              <div className="field">
                <label>{tr("au.repeatPw")}</label>
                <input type="password" required value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null); }} placeholder={tr("au.repeatPh")} />
              </div>
              {error && <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p>}
              <button type="submit" className="btn btn-dark" style={{ width: "100%" }} disabled={loading}>
                {loading ? tr("au.savingPw") : tr("au.changePw")}
              </button>
            </>
          )}

          <p className="auth-foot"><Link href="/signin">{tr("au.backToSignin")}</Link></p>
        </form>
      </div>
    </div>
  );
}
