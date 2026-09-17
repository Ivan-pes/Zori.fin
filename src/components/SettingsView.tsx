"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TwoFactorSettings } from "@/components/TwoFactorSettings";
import { translator } from "@/lib/i18n/dictionaries";
import { TeamPanel } from "@/components/TeamPanel";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { CURRENCIES, currencySymbol } from "@/lib/currency";

type Tab = "profile" | "billing" | "team" | "notif" | "security";
interface Member { id: string; email: string; role: string; status: string; label?: string | null }

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  profile: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  billing: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>,
  team: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  notif: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>,
  security: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
};

type ReportFreq = "off" | "daily" | "weekly" | "monthly";
type NotifPrefs = { reportFrequency: ReportFreq; gap: boolean; payment: boolean; churn: boolean };
type NotifBool = "gap" | "payment" | "churn";

function initNotif(p: Record<string, unknown>): NotifPrefs {
  const raw = p.reportFrequency;
  const freq: ReportFreq =
    raw === "off" || raw === "daily" || raw === "weekly" || raw === "monthly"
      ? raw
      : p.weekly === false
        ? "off"
        : "weekly";
  return {
    reportFrequency: freq,
    gap: p.gap !== false,
    payment: p.payment !== false,
    churn: p.churn === true,
  };
}

export function SettingsView({ orgName, email, stripeConnected, notifPrefs, prices, currentPlan, members: initialMembers = [], teamSeats = 1, taxRatePct = null, industry: industry0 = null, baseCurrency: baseCurrency0 = "EUR", locale: locale0 = "ru", avatarDataUrl: avatar0 = null, twofaMethod = "none", uiLocale = DEFAULT_LOCALE, accountType = "business", personalPlan = "free_personal", pricePlus = false, household: household0 = false, isOwner = true, comped = false }: { orgName: string; email: string; stripeConnected: boolean; notifPrefs: Record<string, unknown>; prices: { starter: boolean; growth: boolean; pro: boolean; plus?: boolean }; currentPlan: string; members?: Member[]; teamSeats?: number; taxRatePct?: number | null; industry?: string | null; baseCurrency?: string; locale?: string; avatarDataUrl?: string | null; twofaMethod?: "none" | "totp" | "email"; uiLocale?: Locale; accountType?: "business" | "personal"; personalPlan?: "free_personal" | "plus"; pricePlus?: boolean; household?: boolean; isOwner?: boolean; comped?: boolean }) {
  const tr = translator(uiLocale);
  const TABS: { id: Tab; label: string }[] = [
    { id: "profile", label: tr("set.tab.profile") },
    { id: "billing", label: tr("set.tab.billing") },
    // В личном пространстве вкладка называется «Семья», в бизнесе — «Команда».
    { id: "team", label: accountType === "personal" ? tr("nav.family") : tr("set.tab.team") },
    { id: "notif", label: tr("set.tab.notif") },
    { id: "security", label: tr("set.tab.security") },
  ];
  const FREQ_OPTS: { v: ReportFreq; l: string }[] = [
    { v: "off", l: tr("set.freq.off") },
    { v: "daily", l: tr("set.freq.daily") },
    { v: "weekly", l: tr("set.freq.weekly") },
    { v: "monthly", l: tr("set.freq.monthly") },
  ];
  // Бессрочный доступ выдан вручную — покупать нечего.
  const canBuy = isOwner && !comped;
  const planName = (p: string) => (p === "free" ? tr("plan.free") : p === "starter" ? tr("plan.starter") : p === "growth" ? tr("plan.growth") : p === "pro" ? tr("plan.pro") : p);
  const [tab, setTab] = useState<Tab>("profile");
  const [name, setName] = useState(orgName);
  const [taxRate, setTaxRate] = useState(taxRatePct != null ? String(taxRatePct) : "");
  const router = useRouter();
  const [industry, setIndustry] = useState(industry0 ?? "saas");
  const [currency, setCurrency] = useState(baseCurrency0 ?? "EUR");
  // Селект языка отражает РЕАЛЬНЫЙ язык интерфейса (cookie/uiLocale), а не
  // org.locale из БД — иначе после смены языка селект «откатывался» на старое.
  const [locale, setLocale] = useState<string>(uiLocale ?? locale0 ?? "ru");
  const [avatar, setAvatar] = useState<string | null>(avatar0);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [notif, setNotif] = useState<NotifPrefs>(() => initNotif(notifPrefs));
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);
  const initial = (orgName.trim()[0] ?? "Z").toUpperCase();

  async function switchAccountType(next: "business" | "personal") {
    if (next === accountType) return;
    await fetch("/api/settings/account-type", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: next }),
    }).catch(() => {});
    window.location.href = "/app";
  }

  async function saveProfile() {
    setSaving(true);
    setSaved(false);
    setSaveErr(null);
    try {
      const r = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          taxRatePct: taxRate.trim() === "" ? null : Number(taxRate.replace(",", ".")),
          industry,
          baseCurrency: currency,
          locale,
          avatarDataUrl: avatar,
        }),
      });
      if (r.ok) {
        setSaved(true);
        // Серверные части страницы (валюта в цифрах, сайдбар) подхватывают
        // новую базу без ручной перезагрузки.
        router.refresh();
      } else {
        const data = (await r.json().catch(() => null)) as { error?: string } | null;
        setSaveErr(data?.error ?? tr("set.saveErr"));
      }
    } catch {
      setSaveErr(tr("set.saveErr"));
    } finally {
      setSaving(false);
    }
  }

  function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarErr(null);
    if (!/^image\//.test(file.type)) { setAvatarErr(tr("set.avatarErr")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const S = 128;
        const canvas = document.createElement("canvas");
        canvas.width = S; canvas.height = S;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        setAvatar(canvas.toDataURL("image/jpeg", 0.85));
        setSaved(false);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }
  function saveNotif(next: NotifPrefs) {
    setNotif(next);
    void fetch("/api/settings/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }
  function toggle(k: NotifBool) {
    saveNotif({ ...notif, [k]: !notif[k] });
  }
  function setFreq(f: ReportFreq) {
    saveNotif({ ...notif, reportFrequency: f });
  }

  async function changePassword() {
    setPwdBusy(true);
    setPwdMsg(null);
    try {
      const r = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setPwdMsg({ ok: true, text: tr("set.pwdUpdated") });
        setCurPwd("");
        setNewPwd("");
      } else {
        setPwdMsg({ ok: false, text: d.error ?? tr("set.pwdFail") });
      }
    } finally {
      setPwdBusy(false);
    }
  }

  async function goToCheckout(plan: "starter" | "growth" | "pro" | "plus") {
    const r = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const d = await r.json().catch(() => ({}));
    if (d.url) window.location.href = d.url as string;
  }

  return (
    <div className="set-grid">
      <div className="set-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{TAB_ICONS[t.id]}{t.label}</button>
        ))}
      </div>

      <div>
        {tab === "profile" && (
          <div className="set-sec">
            <h3>{tr("set.tab.profile")}</h3>
            <div className="desc">{tr("set.profileDesc")}</div>
            <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={onAvatarPick} />
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22 }}>
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt={tr("set.avatarAlt")} className="avatar-big" style={{ objectFit: "cover", padding: 0 }} />
              ) : (
                <div className="avatar-big">{initial}</div>
              )}
              <div>
                <button className="btn btn-line btn-sm" onClick={() => avatarInputRef.current?.click()}>{tr("set.uploadAvatar")}</button>
                {avatar && <button className="btn btn-line btn-sm" style={{ marginLeft: 8, color: "var(--danger)" }} onClick={() => { setAvatar(null); setSaved(false); }}>{tr("set.remove")}</button>}
                <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 7 }}>{avatarErr ?? tr("set.avatarHint")}</div>
              </div>
            </div>
            <div className="form-row">
              <div className="field"><label>{tr("set.nameLabel")}</label><input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></div>
              <div className="field"><label>Email</label><input value={email} readOnly style={{ color: "var(--ink-faint)" }} /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>{tr("set.bizType")} <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>{tr("set.forBench")}</span></label>
                <select value={industry} onChange={(e) => { setIndustry(e.target.value); setSaved(false); }}>
                  <option value="saas">SaaS</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="agency">{tr("bm.ind.agency")}</option>
                  <option value="freelance">{tr("bm.ind.freelance")}</option>
                </select>
              </div>
              <div className="field"><label>{tr("set.baseCurrency")}</label>
                <select value={currency} onChange={(e) => { setCurrency(e.target.value); setSaved(false); }}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{currencySymbol(c)} {c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field"><label>{tr("set.uiLang")}</label>
                <select value={locale} onChange={(e) => {
                  const v = e.target.value;
                  setLocale(v);
                  setSaved(false);
                  fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: v }) })
                    .then(() => window.location.reload())
                    .catch(() => {});
                }}>
                  <option value="en">English</option>
                  <option value="uk">Українська</option>
                  <option value="es">Español</option>
                  <option value="ru">Русский</option>
                </select>
              </div>
              <div className="field"><label>{tr("set.taxReserve")}</label><input value={taxRate} onChange={(e) => { setTaxRate(e.target.value); setSaved(false); }} placeholder={tr("set.taxPh")} inputMode="decimal" /></div>
            </div>
            <div className="field" style={{ marginBottom: 18 }}>
              <label>{tr("set.spaceType")}</label>
              {isOwner ? (
                <>
                  <div className="seg" style={{ display: "inline-flex" }}>
                    <button type="button" className={accountType === "business" ? "on" : ""} onClick={() => switchAccountType("business")}>{tr("set.typeBusiness")}</button>
                    <button type="button" className={accountType === "personal" ? "on" : ""} onClick={() => switchAccountType("personal")}>{tr("set.typePersonal")}</button>
                  </div>
                  <div className="fhint">{tr("set.spaceTypeHint")}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{accountType === "personal" ? tr("set.typePersonal") : tr("set.typeBusiness")}</div>
                  <div className="fhint">{tr("set.ownerOnlyNote")}</div>
                </>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button
                className={`btn btn-sm ${saved ? "btn-accent" : "btn-dark"}`}
                onClick={saveProfile}
                disabled={saving || !name.trim()}
              >
                {saving ? tr("set.saving") : saved ? tr("set.saved") : tr("common.save")}
              </button>
              {saving && <span className="yx-spin" aria-hidden="true" />}
              {saveErr && <span style={{ fontSize: 13, color: "var(--danger)", fontWeight: 600 }}>{saveErr}</span>}
            </div>
          </div>
        )}

        {tab === "billing" && accountType === "personal" && (
          <div className="set-sec">
            <h3>{tr("set.planTitle")}</h3>
            <div className="desc">{tr("set.pPlanDesc")}</div>
            {!isOwner && <div className="note info" style={{ marginBottom: 12 }}><svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><span>{tr("set.ownerOnlyNote")}</span></div>}
            {comped && <div className="note info" style={{ marginBottom: 12 }}><svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><span>{tr("set.planLifetimeNote")}</span></div>}
            <div className="plan-mini">
              <div className={`plan-c ${personalPlan === "free_personal" ? "cur" : ""}`}>
                <div className="pn">{tr("plan.free")}</div><div className="pp">{tr("set.priceFree")}</div>
                <div className="pf">{tr("set.pFeatFree")}</div>
                {personalPlan === "free_personal" && <div className="cur-tag">{tr("set.currentPlan")}</div>}
              </div>
              <div className={`plan-c ${personalPlan === "plus" && currentPlan !== "pro" ? "cur" : ""}`}>
                <div className="pn">Plus</div><div className="pp">11 €<span>{tr("set.perMonth")}</span></div>
                <div className="pf">{tr("set.pFeatPlus")}</div>
                {personalPlan === "plus" && currentPlan !== "pro"
                  ? <div className="cur-tag">{comped ? tr("set.planLifetime") : tr("set.currentPlan")}</div>
                  : currentPlan !== "pro" && <button className="btn btn-accent btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => goToCheckout("plus")} disabled={!pricePlus || !canBuy}>{pricePlus ? tr("set.goPlan") : tr("set.soon")}</button>}
              </div>
              <div className={`plan-c ${currentPlan === "pro" ? "cur" : ""}`}>
                <div className="pn">Pro</div><div className="pp">99 €<span>{tr("set.perMonth")}</span></div>
                <div className="pf">{tr("set.pFeatProPersonal")}</div>
                {currentPlan === "pro"
                  ? <div className="cur-tag">{comped ? tr("set.planLifetime") : tr("set.currentPlan")}</div>
                  : <button className="btn btn-accent btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => goToCheckout("pro")} disabled={!prices.pro || !canBuy}>{prices.pro ? tr("set.goPlan") : tr("set.soon")}</button>}
              </div>
            </div>
          </div>
        )}

        {tab === "billing" && accountType !== "personal" && (
          <div className="set-sec">
            <h3>{tr("set.planTitle")}</h3>
            <div className="desc">{currentPlan === "free" ? tr("set.planDescFree") : tr("set.planDescActive", { plan: planName(currentPlan) })} {tr("set.planDescTail")}</div>
            {!isOwner && <div className="note info" style={{ marginBottom: 12 }}><svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><span>{tr("set.ownerOnlyNote")}</span></div>}
            {comped && <div className="note info" style={{ marginBottom: 12 }}><svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><span>{tr("set.planLifetimeNote")}</span></div>}
            <div className="plan-mini plan-mini-4">
              <div className={`plan-c ${currentPlan === "free" ? "cur" : ""}`}>
                <div className="pn">{tr("plan.free")}</div><div className="pp">{tr("set.priceFree")}</div>
                <div className="pf">{tr("set.featFree")}</div>
                {currentPlan === "free" && <div className="cur-tag">{tr("set.currentPlan")}</div>}
              </div>
              <div className={`plan-c ${currentPlan === "starter" ? "cur" : ""}`}>
                <div className="pn">Starter</div><div className="pp">22 €<span>{tr("set.perMonth")}</span></div>
                <div className="pf">{tr("set.featStarter")}</div>
                {currentPlan === "starter"
                  ? <div className="cur-tag">{comped ? tr("set.planLifetime") : tr("set.currentPlan")}</div>
                  : <button className="btn btn-line btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => goToCheckout("starter")} disabled={!prices.starter || !canBuy}>{prices.starter ? tr("set.goPlan") : tr("set.soon")}</button>}
              </div>
              <div className={`plan-c ${currentPlan === "growth" ? "cur" : ""}`}>
                <div className="pn">Growth</div><div className="pp">42 €<span>{tr("set.perMonth")}</span></div>
                <div className="pf">{tr("set.featGrowth")}</div>
                {currentPlan === "growth"
                  ? <div className="cur-tag">{comped ? tr("set.planLifetime") : tr("set.currentPlan")}</div>
                  : <button className="btn btn-accent btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => goToCheckout("growth")} disabled={!prices.growth || !canBuy}>{prices.growth ? tr("set.goPlan") : tr("set.soon")}</button>}
              </div>
              <div className={`plan-c ${currentPlan === "pro" ? "cur" : ""}`}>
                <div className="pn">Pro</div><div className="pp">99 €<span>{tr("set.perMonth")}</span></div>
                <div className="pf">{tr("set.featPro")}</div>
                {currentPlan === "pro"
                  ? <div className="cur-tag">{comped ? tr("set.planLifetime") : tr("set.currentPlan")}</div>
                  : <button className="btn btn-line btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => goToCheckout("pro")} disabled={!prices.pro || !canBuy}>{prices.pro ? tr("set.goPlan") : tr("set.soon")}</button>}
              </div>
            </div>
            <div className="note info"><svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><span>{comped ? tr("set.planLifetimeNote") : currentPlan === "free" ? tr("set.planNoteFree") : tr("set.planNotePaid")}</span></div>
          </div>
        )}

        {tab === "team" && (
          <TeamPanel
            ownerEmail={email}
            members={initialMembers}
            teamSeats={teamSeats}
            isOwner={isOwner}
            accountType={accountType}
            personalPlan={personalPlan}
            household={household0}
            uiLocale={uiLocale}
          />
        )}

        {tab === "notif" && (
          <div className="set-sec">
            <h3>{tr("set.tab.notif")}</h3>
            <div className="desc">{tr("set.notifDesc", { email })}</div>

            <div className="opt-row" style={{ alignItems: "flex-start" }}>
              <div className="ot">
                <b>{tr("set.emailSummary")}</b>
                <span>{tr("set.emailSummarySub", { off: notif.reportFrequency === "off" ? tr("set.summaryOff") : "" })}</span>
              </div>
              <div className="freq-seg">
                {FREQ_OPTS.map((o) => (
                  <button key={o.v} className={notif.reportFrequency === o.v ? "on" : ""} onClick={() => setFreq(o.v)}>{o.l}</button>
                ))}
              </div>
            </div>

            {([
              ["gap", tr("set.notifGapTitle"), tr("set.notifGapSub")],
              ["payment", tr("set.notifPayTitle"), tr("set.notifPaySub")],
              ["churn", tr("set.notifChurnTitle"), tr("set.notifChurnSub")],
            ] as [NotifBool, string, string][]).map(([k, title, sub]) => (
              <div className="opt-row" key={k}>
                <div className="ot"><b>{title}</b><span>{sub}</span></div>
                <div className={`tg ${notif[k] ? "on" : ""}`} onClick={() => toggle(k)} role="switch" aria-checked={notif[k]} />
              </div>
            ))}
          </div>
        )}

        {tab === "security" && (
          <>
            <div className="set-sec">
              <h3>{tr("set.password")}</h3>
              <div className="desc">{tr("set.passwordDesc")}</div>
              <div className="form-row" style={{ maxWidth: 520 }}>
                <div className="field"><label>{tr("set.curPwd")}</label><input type="password" value={curPwd} onChange={(e) => { setCurPwd(e.target.value); setPwdMsg(null); }} placeholder="••••••••" /></div>
                <div className="field"><label>{tr("set.newPwd")}</label><input type="password" value={newPwd} onChange={(e) => { setNewPwd(e.target.value); setPwdMsg(null); }} placeholder={tr("set.min8")} /></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button className="btn btn-dark btn-sm" onClick={changePassword} disabled={pwdBusy || !curPwd || newPwd.length < 8}>{pwdBusy ? tr("set.changing") : tr("set.updatePwd")}</button>
                {pwdMsg && <span style={{ fontSize: 13, fontWeight: 600, color: pwdMsg.ok ? "var(--accent-ink)" : "var(--danger)" }}>{pwdMsg.text}</span>}
              </div>
            </div>

            <TwoFactorSettings initialMethod={twofaMethod} locale={uiLocale} />

            <div className="set-sec">
              <h3>{tr("set.dataAccess")}</h3>
              <div className="desc">{tr("set.dataAccessDesc")}</div>
              <div className="opt-row">
                <div className="ot"><b>Stripe</b><span>{stripeConnected ? tr("set.stripeRoConn") : tr("set.stripeNotConn")}</span></div>
                <span className={`st-dot ${stripeConnected ? "st-on" : "st-off"}`}><span className="d" />{stripeConnected ? tr("set.protected") : "—"}</span>
              </div>
            </div>
            <div className="set-sec" style={{ borderColor: "var(--danger-soft)" }}>
              <h3 style={{ color: "var(--danger)" }}>{tr("set.dangerZone")}</h3>
              <div className="desc">{tr("set.dangerDesc")}</div>
              <button className="btn btn-sm" style={{ background: "var(--danger-soft)", color: "var(--danger)" }} disabled>{tr("set.deleteAccount")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
