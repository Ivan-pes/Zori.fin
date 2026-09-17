"use client";

import { useState } from "react";
import { translator } from "@/lib/i18n/dictionaries";
import { memberLabelsFor } from "@/lib/team-labels";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export interface TeamMember { id: string; email: string; role: string; status: string; label?: string | null }

// Управление участниками пространства: семья (personal) или команда (business).
// Используется на странице /app/team и во вкладке «Команда» настроек.
export function TeamPanel({
  ownerEmail,
  members: initialMembers = [],
  teamSeats = 1,
  isOwner = true,
  accountType = "business",
  personalPlan = "free_personal",
  household = false,
  uiLocale = DEFAULT_LOCALE,
}: {
  ownerEmail: string;
  members?: TeamMember[];
  teamSeats?: number;
  isOwner?: boolean;
  accountType?: "business" | "personal";
  personalPlan?: "free_personal" | "plus";
  household?: boolean;
  uiLocale?: Locale;
}) {
  const tr = translator(uiLocale);
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("finance");
  const [inviteLabel, setInviteLabel] = useState("");
  const labelOptions = memberLabelsFor(accountType === "personal");
  const [teamMsg, setTeamMsg] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const seatsUsed = 1 + members.length;
  const canInvite = teamSeats === -1 || seatsUsed < teamSeats;

  const canHousehold = personalPlan === "plus" && isOwner;
  async function toggleHousehold() {
    if (!canHousehold) return;
    await fetch("/api/settings/household", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household: !household }),
    }).catch(() => {});
    window.location.reload();
  }

  async function invite() {
    setTeamBusy(true);
    setTeamMsg(null);
    try {
      const r = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, label: inviteLabel || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setTeamMsg(d.error ?? tr("set.inviteFail")); return; }
      setMembers((m) => [...m.filter((x) => x.email !== d.member.email), d.member]);
      setInviteEmail("");
      setInviteLabel("");
      setTeamMsg(tr("set.inviteSent", { email: d.member.email }));
    } finally {
      setTeamBusy(false);
    }
  }

  async function removeMember(id: string) {
    await fetch("/api/team/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setMembers((m) => m.filter((x) => x.id !== id));
  }

  async function changeMember(id: string, patch: { role?: string; label?: string | null }) {
    setTeamMsg(null);
    const r = await fetch("/api/team/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) { setTeamMsg(d?.error ?? tr("set.inviteFail")); return; }
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, role: d.member.role, label: d.member.label } : x)));
    setTeamMsg(tr("set.roleChanged", { email: d.member.email }));
  }

  const roleLabel = (role: string) =>
    role === "viewer" ? tr("set.roleViewer") : accountType === "personal" ? tr("set.rolePartner") : tr("set.roleFinance");
  const memberLabelText = (label: string | null | undefined) =>
    label && (labelOptions as readonly string[]).includes(label) ? tr(`mem.${label}`) : null;

  const initialOf = (email: string) => (email.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="set-sec team-panel">
      {/* Изумрудный хиро: название, сколько мест занято, household-тумблер. */}
      <div className="team-hero">
        <div className="th-ic">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        </div>
        <div className="th-txt">
          <div className="th-title">{accountType === "personal" ? tr("nav.family") : tr("set.tab.team")}</div>
          <div className="th-sub">{tr(accountType === "personal" ? "set.teamDescPersonal" : "set.teamDesc", { seats: teamSeats === -1 ? tr("set.unlimited") : teamSeats, used: seatsUsed })}</div>
        </div>
        <div className="th-right">
          <span className="seats-pill">{seatsUsed} / {teamSeats === -1 ? "∞" : teamSeats}</span>
        </div>
      </div>

      {accountType === "personal" && (
        <>
          <div className="hh-card">
            <div className="hh-txt">
              <b>{tr("set.householdTitle")}</b>
              <span>{tr("set.householdSub")}</span>
            </div>
            {personalPlan === "plus"
              ? <div className={`tg ${household ? "on" : ""}`} onClick={canHousehold ? toggleHousehold : undefined} role="switch" aria-checked={household} aria-disabled={!canHousehold} style={canHousehold ? undefined : { opacity: 0.5, cursor: "default" }} />
              : <span className="cat-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)", flex: "none" }}>Plus</span>}
          </div>
          {personalPlan !== "plus" && (
            <div className="note info" style={{ marginBottom: 12 }}><svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><span>{tr("set.householdGate")}</span></div>
          )}
        </>
      )}

      <div className="team-list">
        <div className="team-row">
          <div className="mem-av">{initialOf(ownerEmail)}</div>
          <div className="em">
            <span className="tx-name">{ownerEmail}</span>
            <span className="rl"><span className="st-dot" />{tr("set.statusActive")}</span>
          </div>
          <span className="mem-chip">{tr("set.ownerYou")}</span>
        </div>
        {members.map((m) => (
          <div className="team-row" key={m.id}>
            <div className={`mem-av ${m.status === "invited" ? "inv" : ""}`}>{initialOf(m.email)}</div>
            <div className="em">
              <span className="tx-name">{m.email}</span>
              <span className="rl">
                <span className={`st-dot ${m.status === "invited" ? "inv" : ""}`} />
                {isOwner
                  ? (m.status === "invited" ? tr("set.statusInvited") : tr("set.statusActive"))
                  : [memberLabelText(m.label), roleLabel(m.role), m.status === "invited" ? tr("set.statusInvited") : tr("set.statusActive")].filter(Boolean).join(" · ")}
              </span>
            </div>
            {!isOwner && memberLabelText(m.label) && <span className="mem-chip">{memberLabelText(m.label)}</span>}
            {isOwner && (
              <>
                <select value={m.label && (labelOptions as readonly string[]).includes(m.label) ? m.label : ""} onChange={(e) => changeMember(m.id, { label: e.target.value || null })} aria-label={tr("set.whoLabel")}>
                  <option value="">{tr("set.whoLabel")}</option>
                  {labelOptions.map((l) => <option key={l} value={l}>{tr(`mem.${l}`)}</option>)}
                </select>
                <select value={m.role} onChange={(e) => changeMember(m.id, { role: e.target.value })} aria-label={tr("set.role")}>
                  <option value="finance">{accountType === "personal" ? tr("set.rolePartner") : tr("set.roleFinance")}</option>
                  <option value="viewer">{tr("set.roleViewer")}</option>
                </select>
                <button className="btn btn-line btn-sm" style={{ color: "var(--danger)", flex: "none" }} onClick={() => removeMember(m.id)}>{tr("set.remove2")}</button>
              </>
            )}
          </div>
        ))}
      </div>

      {!isOwner ? (
        <div className="note info"><svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><span>{tr("set.ownerOnlyNote")}</span></div>
      ) : canInvite ? (
        <div className="invite-card">
          <h4>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg>
            {tr("set.invite")}
          </h4>
          <div className="invite-row">
            <div className="field"><label>{tr("set.memberEmail")}</label><input value={inviteEmail} onChange={(e) => { setInviteEmail(e.target.value); setTeamMsg(null); }} placeholder={accountType === "personal" ? "partner@example.com" : "accountant@example.com"} /></div>
            <div className="field"><label>{tr("set.whoLabel")}</label><select value={inviteLabel} onChange={(e) => setInviteLabel(e.target.value)}><option value="">—</option>{labelOptions.map((l) => <option key={l} value={l}>{tr(`mem.${l}`)}</option>)}</select></div>
            <div className="field"><label>{tr("set.role")}</label><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}><option value="finance">{accountType === "personal" ? tr("set.rolePartner") : tr("set.roleFinance")}</option><option value="viewer">{tr("set.roleViewer")}</option></select></div>
            <button className="btn btn-accent btn-sm" onClick={invite} disabled={teamBusy || !inviteEmail.trim()}>{teamBusy ? tr("set.sending") : tr("set.invite")}</button>
          </div>
          <div className="fhint" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>{tr(accountType === "personal" ? "set.roleHintPersonal" : "set.roleHintBusiness")}</div>
        </div>
      ) : (
        <div className="note info"><svg className="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><span>{tr(accountType === "personal" ? "set.seatsFullPersonal" : "set.seatsFull")}</span></div>
      )}
      {teamMsg && <div style={{ fontSize: 13, color: "var(--accent-ink)", fontWeight: 600, marginTop: 10 }}>{teamMsg}</div>}
    </div>
  );
}
