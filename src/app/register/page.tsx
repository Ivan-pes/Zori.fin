"use client";

import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { GoogleIcon } from "@/components/GoogleIcon";
import { signIn, getProviders } from "next-auth/react";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, getClientLocale, type Locale } from "@/lib/i18n";

export default function RegisterPage() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => setLocale(getClientLocale()), []);
  const tr = translator(locale);
  const [spaceType, setSpaceType] = useState<"business" | "personal">("business");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  // ?flow=personal (кнопка «Завести личный кабинет» с лендинга) — сразу «Для себя».
  // ?invite=<email> (ссылка из письма-приглашения) — подставляем адрес:
  // приглашение привязано к нему, регистрация с другим email его не активирует.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("flow") === "personal") setSpaceType("personal");
    const invite = params.get("invite");
    if (invite) setEmail(invite);
  }, []);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleNote, setGoogleNote] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailSent, setEmailSent] = useState(true);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    getProviders()
      .then((p) => setGoogleEnabled(!!p?.google))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, businessName, accountType: spaceType }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Приглашённый с уже существующим аккаунтом — ведём на вход,
        // приглашение привяжется автоматически после входа.
        if (res.status === 409) {
          const invite = new URLSearchParams(window.location.search).get("invite");
          if (invite) {
            window.location.href = `/signin?invite=${encodeURIComponent(invite)}`;
            return;
          }
        }
        setError(data.error ?? tr("au.regFail"));
        return;
      }
      setEmailSent(data.emailSent !== false);
      setSent(true);
    } catch {
      setError(tr("au.netErr"));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResent(true);
  }

  const aside: ReactNode = (
    <aside className="auth-aside">
      <div className="glow" />
      <div className="brand"><div className="logo">Z</div>Zori</div>
      <div className="auth-quote">
        <h2>{tr("au.regQuote")}</h2>
        <p>{tr("au.regQuoteSub")}</p>
      </div>
      <div className="auth-stat">
        <div><b>{tr("au.stat2000")}</b><span>{tr("au.stat2000Sub")}</span></div>
        <div><b>{tr("au.statRuEn")}</b><span>{tr("au.statRuEnSub")}</span></div>
      </div>
    </aside>
  );

  if (sent) {
    return (
      <div className="auth-wrap">
        {aside}
        <div className="auth-form-side">
          <div className="auth-card">
            <h1>{tr("au.checkMail")}</h1>
            <p className="sub">
              {tr("au.sentLinkPre")} <b>{email}</b>{tr("au.sentLinkPost")}
            </p>
            {!emailSent && (
              <p style={{ color: "#7A4E18", background: "var(--warn-soft)", fontSize: 13, padding: "10px 12px", borderRadius: 10, marginBottom: 14, lineHeight: 1.5 }}>
                {tr("au.emailDelayed")}
              </p>
            )}
            <button type="button" className="btn btn-line" style={{ width: "100%" }} onClick={resend} disabled={resent}>
              {resent ? tr("au.sentOk") : tr("au.resendLink")}
            </button>
            <p className="auth-foot">{tr("au.alreadyConfirmed")} <Link href="/signin">{tr("au.signIn")}</Link></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      {aside}
      <div className="auth-form-side">
        <form className="auth-card" onSubmit={onSubmit}>
          <h1>{tr("au.createAccount")}</h1>
          <p className="sub">{tr("au.createSub")}</p>

          <button
            type="button"
            className="oauth-btn"
            onClick={() => (googleEnabled ? signIn("google", { redirectTo: "/app" }) : setGoogleNote(true))}
          >
            <GoogleIcon />{tr("au.googleRegister")}
          </button>
          {googleNote && (
            <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginBottom: 10 }}>
              {tr("au.googleRegLater")}
            </p>
          )}

          <div className="divider">{tr("au.orEmail")}</div>

          <div className="field">
            <label>{tr("au.spaceFor")}</label>
            <div className="seg" style={{ display: "inline-flex" }}>
              <button type="button" className={spaceType === "business" ? "on" : ""} onClick={() => setSpaceType("business")}>{tr("au.forBusiness")}</button>
              <button type="button" className={spaceType === "personal" ? "on" : ""} onClick={() => setSpaceType("personal")}>{tr("au.forSelf")}</button>
            </div>
            <div className="fhint" style={{ fontSize: 12, color: "var(--ink-faint)" }}>{tr("au.switchAnytime")}</div>
          </div>
          <div className="field">
            <label>{spaceType === "personal" ? tr("au.bizNamePersonal") : tr("au.bizName")}</label>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder={spaceType === "personal" ? "Ivan" : "Atelier Nord"} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div className="field">
            <label>{tr("au.password")}</label>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr("au.min8")} />
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p>}

          <button type="submit" className="btn btn-accent" style={{ width: "100%" }} disabled={loading}>
            {loading ? tr("au.creating") : tr("au.createArrow")}
          </button>

          <p className="legal">
            {tr("au.legal")}
          </p>
          <p className="auth-foot">{tr("au.haveAccount")} <Link href="/signin">{tr("au.signIn")}</Link></p>
        </form>
      </div>
    </div>
  );
}
