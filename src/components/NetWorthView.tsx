"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import type { NetWorth, AccountKind } from "@/lib/metrics/networth";
import { CURRENCIES, currencySymbol } from "@/lib/currency";

const KINDS: AccountKind[] = ["cash", "bank", "card", "savings", "asset", "debt"];

export function NetWorthView({
  nw,
  currency = "EUR",
  trend = [],
  locale = DEFAULT_LOCALE,
}: {
  nw: NetWorth;
  currency?: string;
  trend?: { day: string; netCents: number }[];
  locale?: Locale;
}) {
  const tr = translator(locale);
  const router = useRouter();
  const [kind, setKind] = useState<AccountKind>("bank");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [curr, setCurr] = useState(currency);
  const [busy, setBusy] = useState(false);

  async function add() {
    const euros = parseFloat(balance.replace(",", "."));
    if (!name.trim() || !Number.isFinite(euros)) return;
    setBusy(true);
    try {
      await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: name.trim(), balanceCents: Math.round(euros * 100), currency: curr }),
      });
      setName("");
      setBalance("");
      setCurr(currency);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch("/api/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <>
      <div className="grid-3">
        <div className="kpi">
          <div className="k-top"><span className="k-lbl">{tr("nw.net")}</span></div>
          <div className="k-val" style={{ color: nw.netCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>{formatMoney(nw.netCents, currency)}</div>
        </div>
        <div className="kpi">
          <div className="k-top"><span className="k-lbl">{tr("nw.assets")}</span></div>
          <div className="k-val">{formatMoney(nw.assetsCents, currency)}</div>
        </div>
        <div className="kpi">
          <div className="k-top"><span className="k-lbl">{tr("nw.debts")}</span></div>
          <div className="k-val" style={{ color: nw.debtsCents > 0 ? "var(--danger)" : undefined }}>{formatMoney(nw.debtsCents, currency)}</div>
        </div>
      </div>

      {trend.length >= 2 && (() => {
        const W = 560, H = 120, PAD = 6;
        const vals = trend.map((t) => t.netCents);
        let lo = Math.min(...vals), hi = Math.max(...vals);
        if (lo === hi) hi = lo + 100;
        const xOf = (i: number) => PAD + (i / (trend.length - 1)) * (W - PAD * 2);
        const yOf = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);
        const pts = trend.map((t, i) => `${xOf(i).toFixed(1)},${yOf(t.netCents).toFixed(1)}`).join(" ");
        return (
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-head"><h3>{tr("nw.trend")}</h3><span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{tr("nw.trendNote")}</span></div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
              <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        );
      })()}

      <div className="panel" style={{ marginTop: 16 }}>
        {nw.byAccount.length === 0 ? (
          <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("nw.empty")}</p>
        ) : (
          <table className="tx-table tx-full">
            <tbody>
              {nw.byAccount.map((a) => {
                const debt = a.kind === "debt" || a.balanceCents < 0;
                return (
                  <tr key={a.id}>
                    <td><span className="tx-name">{a.name}</span> <span className="cat-tag" style={{ marginLeft: 6 }}>{tr(`nw.kind.${a.kind}`)}</span></td>
                    <td className={`amt ${debt ? "neg" : "pos"}`}>{formatMoney(a.balanceCents, a.currency)}</td>
                    <td style={{ textAlign: "right" }}><button className="btn btn-line btn-sm" style={{ color: "var(--danger)" }} onClick={() => remove(a.id)}>{tr("nw.remove")}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ marginTop: 16, maxWidth: 640 }}>
        <div className="panel-head" style={{ marginBottom: 10 }}><h3>{tr("nw.addTitle")}</h3></div>
        <div className="p-addform nw">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{tr("nw.kind")}</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{tr(`nw.kind.${k}`)}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{tr("nw.name")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Revolut" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{tr("nw.balance", { cur: currencySymbol(curr) })}</label>
            <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="1500" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{tr("set.baseCurrency")}</label>
            <select value={curr} onChange={(e) => setCurr(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{currencySymbol(c)} {c}</option>)}
            </select>
          </div>
          <button className="btn btn-dark btn-sm" onClick={add} disabled={busy || !name.trim() || !balance.trim()}>{tr("nw.add")}</button>
        </div>
      </div>
    </>
  );
}
