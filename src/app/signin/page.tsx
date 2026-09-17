"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn, getProviders } from "next-auth/react";
import Link from "next/link";
import { GoogleIcon } from "@/components/GoogleIcon";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, getClientLocale, type Locale } from "@/lib/i18n";

export default function SignInPage() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => setLocale(getClientLocale()), []);
  const tr = translator(locale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [twofa, setTwofa] = useState<null | "totp" | "email">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleNote, setGoogleNote] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteFlow, setInviteFlow] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("verified") === "1") setNotice(tr("au.verified"));
    else if (p.get("reset") === "1") setNotice(tr("au.resetDone"));
    else if (p.get("error") === "verify") setError(tr("au.verifyErr"));
    // Ссылка из письма-приглашения: подставляем адрес, к нему привязан доступ.
    const inv = p.get("invite");
    if (inv) {
      setEmail(inv);
      setInvite(inv);
      setInviteFlow(p.get("flow"));
      setNotice(tr("au.inviteNotice"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    getProviders()
      .then((p) => setGoogleEnabled(!!p?.google))
      .catch(() => {});
  }, []);

  async function finishLogin(extra: Record<string, string>) {
    const res = await signIn("credentials", { email, password, redirect: false, ...extra });
    if (res?.error) return false;
    router.push("/app");
    router.refresh();
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (twofa) {
      if (!(await finishLogin({ code }))) {
        setError(tr("au.wrongCode"));
        setLoading(false);
      }
      return;
    }

    setNeedsVerify(false);
    if (await finishLogin({})) return;

    try {
      const pc = await (
        await fetch("/api/auth/precheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        })
      ).json();
      if (pc.limited) {
        setError(tr("au.tooMany"));
        setLoading(false);
        return;
      }
      if (pc.needsVerification) {
        setNeedsVerify(true);
        setError(tr("au.confirmEmail"));
        setLoading(false);
        return;
      }
      if (pc.ok && (pc.twofa === "totp" || pc.twofa === "email")) {
        setTwofa(pc.twofa);
        setCode("");
        setLoading(false);
        return;
      }
    } catch {}
    setError(tr("au.wrongCreds"));
    setLoading(false);
  }

  async function resend() {
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setNeedsVerify(false);
    setError(null);
    setNotice(tr("au.resentMail"));
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <div className="glow" />
        <div className="brand"><div className="logo">Z</div>Zori</div>
        <div className="auth-quote">
          <h2>{tr("au.quote")}</h2>
          <p>{tr("au.quoteSub")}</p>
        </div>
        <div className="auth-stat">
          <div><b>{tr("au.stat10min")}</b><span>{tr("au.stat10minSub")}</span></div>
          <div><b>{tr("au.statReadonly")}</b><span>{tr("au.statReadonlySub")}</span></div>
          <div><b>{tr("au.stat49")}</b><span>{tr("au.stat49Sub")}</span></div>
        </div>
      </aside>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={onSubmit}>
          {twofa ? (
            <>
              <h1>{tr("au.twofaTitle")}</h1>
              <p className="sub">
                {twofa === "totp" ? tr("au.twofaTotp") : tr("au.twofaEmail")}
              </p>

              {notice && (
                <p style={{ color: "var(--accent-ink)", background: "var(--accent-soft)", fontSize: 13.5, padding: "10px 12px", borderRadius: 10, marginBottom: 14 }}>{notice}</p>
              )}

              <div className="field">
                <label>{tr("au.confirmCode")}</label>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(null); }}
                  placeholder="123456"
                  style={{ letterSpacing: 4, fontSize: 18, textAlign: "center" }}
                />
              </div>

              {error && <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p>}

              <button type="submit" className="btn btn-dark" style={{ width: "100%" }} disabled={loading || code.trim().length < 6}>
                {loading ? tr("au.checking") : tr("au.signInArrow")}
              </button>
              <button type="button" className="btn btn-line" style={{ width: "100%", marginTop: 10 }} onClick={() => { setTwofa(null); setError(null); setCode(""); }}>
                {tr("au.back")}
              </button>
            </>
          ) : (
            <>
              <h1>{tr("au.welcomeBack")}</h1>
              <p className="sub">{tr("au.welcomeSub")}</p>

              <button
                type="button"
                className="oauth-btn"
                onClick={() => (googleEnabled ? signIn("google", { redirectTo: "/app" }) : setGoogleNote(true))}
              >
                <GoogleIcon />{tr("au.googleSignIn")}
              </button>
              {googleNote && (
                <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginBottom: 10 }}>
                  {tr("au.googleLater")}
                </p>
              )}

              <div className="divider">{tr("au.orEmail")}</div>

              {notice && (
                <p style={{ color: "var(--accent-ink)", background: "var(--accent-soft)", fontSize: 13.5, padding: "10px 12px", borderRadius: 10, marginBottom: 14 }}>{notice}</p>
              )}

              <div className="field">
                <label>Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <div className="field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <label>{tr("au.password")}</label>
                  <Link href="/forgot" style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>{tr("au.forgotQ")}</Link>
                </div>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr("au.passwordPh")} />
              </div>

              {error && <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p>}
              {needsVerify && (
                <button type="button" className="btn btn-line" style={{ width: "100%", marginBottom: 12 }} onClick={resend}>
                  {tr("au.resendVerify")}
                </button>
              )}

              <button type="submit" className="btn btn-dark" style={{ width: "100%" }} disabled={loading}>
                {loading ? tr("au.signingIn") : tr("au.signInArrow")}
              </button>

              {invite && (
                <a
                  className="btn btn-line"
                  style={{ width: "100%", marginTop: 10, textAlign: "center" }}
                  href={`/register?invite=${encodeURIComponent(invite)}${inviteFlow === "personal" ? "&flow=personal" : ""}`}
                >
                  {tr("au.inviteRegister")}
                </a>
              )}

              <p className="auth-foot">{tr("au.noAccount")} <Link href="/register">{tr("au.register")}</Link></p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
