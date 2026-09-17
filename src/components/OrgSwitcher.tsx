"use client";

import { useEffect, useRef, useState } from "react";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

interface Org {
  id: string;
  name: string;
  role: string;
  isOwner: boolean;
  type?: "business" | "personal";
}

export function OrgSwitcher({
  orgs,
  activeId,
  planLabel,
  avatarDataUrl,
  locale = DEFAULT_LOCALE,
}: {
  orgs: Org[];
  activeId: string;
  planLabel: string;
  avatarDataUrl: string | null;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const ROLE_LABEL: Record<string, string> = { owner: tr("osw.owner"), finance: tr("set.roleFinance"), viewer: tr("set.roleViewer") };
  const roleLabel = (o: Org) =>
    o.role === "finance" && o.type === "personal" ? tr("set.rolePartner") : ROLE_LABEL[o.role] ?? o.role;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = orgs.find((o) => o.id === activeId) ?? orgs[0];
  const multi = orgs.length > 1;
  const initial = (active?.name.trim()[0] ?? "Z").toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function switchTo(orgId: string) {
    if (orgId === activeId) { setOpen(false); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/org/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (r.ok) window.location.href = "/app";
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        className="user"
        role={multi ? "button" : undefined}
        aria-haspopup={multi ? "listbox" : undefined}
        aria-expanded={multi ? open : undefined}
        onClick={multi ? () => setOpen((v) => !v) : undefined}
        style={multi ? { cursor: "pointer" } : undefined}
      >
        {avatarDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarDataUrl} alt="" className="av" style={{ objectFit: "cover" }} />
        ) : (
          <div className="av">{initial}</div>
        )}
        <div className="meta"><b>{active?.name}</b><br /><span>{planLabel}</span></div>
        {multi && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: "auto", opacity: 0.6, flex: "none" }}><path d="m6 9 6 6 6-6" /></svg>
        )}
      </div>

      {open && multi && (
        <>
          <div className="osw-back" onClick={() => setOpen(false)} />
          <div className="osw-drop" role="listbox" aria-label={tr("osw.spaces")}>
            <div className="osw-head">{tr("osw.spaces")}</div>
            {orgs.map((o) => (
              <button
                key={o.id}
                className={`osw-item ${o.id === activeId ? "on" : ""}`}
                onClick={() => switchTo(o.id)}
                disabled={busy}
                role="option"
                aria-selected={o.id === activeId}
              >
                <span className="osw-av">{(o.name.trim()[0] ?? "Z").toUpperCase()}</span>
                <span className="osw-name">
                  <b>{o.name}</b>
                  <span className="osw-role">{roleLabel(o)}</span>
                </span>
                <span className={`osw-badge ${o.type === "personal" ? "p" : ""}`}>{o.type === "personal" ? tr("osw.personal") : tr("osw.business")}</span>
                {o.id === activeId && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flex: "none" }}><path d="M20 6 9 17l-5-5" /></svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
