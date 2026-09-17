"use client";

import { useState } from "react";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

type Method = "none" | "totp" | "email";
type Mode = "idle" | "totp" | "email" | "disable";

export function TwoFactorSettings({ initialMethod, locale = DEFAULT_LOCALE }: { initialMethod: Method; locale?: Locale }) {
  const tr = translator(locale);
  const [method, setMethod] = useState<Method>(initialMethod);
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [pwd, setPwd] = useState("");

  function reset() {
    setMode("idle"); setErr(null); setCode(""); setQr(""); setSecret(""); setPwd("");
  }

  async function startTotp() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/2fa/totp/setup", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? tr("tfa.errGeneric")); return; }
      setQr(d.qr); setSecret(d.secret); setMode("totp"); setCode("");
    } finally { setBusy(false); }
  }

  async function confirmTotp() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/2fa/totp/enable", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, code }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? tr("tfa.invalidCode")); return; }
      setMethod("totp"); reset(); setOk(tr("tfa.enabledApp"));
    } finally { setBusy(false); }
  }

  async function startEmail() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/2fa/email/setup", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? tr("tfa.errGeneric")); return; }
      setMode("email"); setCode("");
    } finally { setBusy(false); }
  }

  async function confirmEmail() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/2fa/email/enable", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? tr("tfa.invalidCode")); return; }
      setMethod("email"); reset(); setOk(tr("tfa.enabledEmail"));
    } finally { setBusy(false); }
  }

  async function disable() {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/2fa/disable", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd, code }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? tr("tfa.errGeneric")); return; }
      setMethod("none"); reset(); setOk(tr("tfa.disabledOk"));
    } finally { setBusy(false); }
  }

  const label = method === "totp" ? tr("tfa.methodApp") : method === "email" ? tr("tfa.methodEmail") : null;

  return (
    <div className="set-sec">
      <h3>{tr("tfa.title")}</h3>
      <div className="desc">{tr("tfa.desc")}</div>

      {ok && <p style={{ color: "var(--accent-ink)", background: "var(--accent-soft)", fontSize: 13.5, padding: "10px 12px", borderRadius: 10, marginBottom: 14 }}>{ok}</p>}

      {method !== "none" ? (
        <>
          <div className="opt-row">
            <div className="ot"><b>{tr("tfa.on")}</b><span>{tr("tfa.method", { label: label ?? "" })}</span></div>
            <span className="cat-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{tr("tfa.active")}</span>
          </div>
          {mode !== "disable" ? (
            <button className="btn btn-line btn-sm" onClick={() => { setMode("disable"); setErr(null); setOk(null); }}>{tr("tfa.disable")}</button>
          ) : (
            <div style={{ maxWidth: 360 }}>
              <div className="field"><label>{tr("tfa.confirmPwd")}</label><input type="password" value={pwd} onChange={(e) => { setPwd(e.target.value); setErr(null); }} placeholder={tr("tfa.curPwd")} /></div>
              {method === "totp" && (
                <div className="field"><label>{tr("tfa.orCode")}</label><input inputMode="numeric" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} placeholder="123456" style={{ letterSpacing: 4, textAlign: "center", maxWidth: 200 }} /></div>
              )}
              {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-dark btn-sm" disabled={busy} onClick={disable}>{busy ? "…" : tr("tfa.disableBtn")}</button>
                <button className="btn btn-line btn-sm" disabled={busy} onClick={reset}>{tr("common.cancel")}</button>
              </div>
            </div>
          )}
        </>
      ) : mode === "idle" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-dark btn-sm" disabled={busy} onClick={startTotp}>{tr("tfa.connectApp")}</button>
          <button className="btn btn-line btn-sm" disabled={busy} onClick={startEmail}>{tr("tfa.getEmail")}</button>
        </div>
      ) : mode === "totp" ? (
        <div style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 10 }}>
            {tr("tfa.step1")}<br />{tr("tfa.step2")}
          </p>
          <div className="note warn" style={{ marginBottom: 12, fontSize: 12.5 }}>
            <svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
            <span>{tr("tfa.totpWarn")}</span>
          </div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={tr("tfa.qrAlt")} width={180} height={180} style={{ borderRadius: 12, border: "1px solid var(--line)", marginBottom: 10 }} />
          )}
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 12, wordBreak: "break-all" }}>
            {tr("tfa.manualPre")}<br /><code style={{ fontSize: 12.5, color: "var(--ink)" }}>{secret}</code>
          </div>
          <div className="field"><label>{tr("tfa.codeFromApp")}</label><input inputMode="numeric" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} placeholder="123456" style={{ letterSpacing: 4, textAlign: "center", maxWidth: 200 }} /></div>
          {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-dark btn-sm" disabled={busy || code.trim().length < 6} onClick={confirmTotp}>{busy ? "…" : tr("tfa.enable")}</button>
            <button className="btn btn-line btn-sm" disabled={busy} onClick={reset}>{tr("common.cancel")}</button>
          </div>
        </div>
      ) : mode === "email" ? (
        <div style={{ maxWidth: 360 }}>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 12 }}>{tr("tfa.emailSent")}</p>
          <div className="field"><label>{tr("tfa.codeFromEmail")}</label><input inputMode="numeric" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} placeholder="123456" style={{ letterSpacing: 4, textAlign: "center", maxWidth: 200 }} /></div>
          {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-dark btn-sm" disabled={busy || code.trim().length < 6} onClick={confirmEmail}>{busy ? "…" : tr("tfa.enable")}</button>
            <button className="btn btn-line btn-sm" disabled={busy} onClick={startEmail}>{tr("tfa.resend")}</button>
            <button className="btn btn-line btn-sm" disabled={busy} onClick={reset}>{tr("common.cancel")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
