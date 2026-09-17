"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { currencySymbol } from "@/lib/currency";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";

interface ForecastPoint {
  date: string;
  balanceCents: number;
  kind: "actual" | "forecast";
  loCents?: number;
  hiCents?: number;
}
interface CashForecast {
  points: ForecastPoint[];
  startingBalanceCents: number;
  endBalanceCents: number;
  endDeltaCents: number;
  avgDailyNetCents: number;
  minBalanceCents: number;
  gapDate: string | null;
  gapBalanceCents: number | null;
  thresholdCents: number;
  horizonDays: number;
  daysWithActivity: number;
}
interface Scenario {
  id: string;
  name: string;
  assumptions: { monthlyDeltaCents?: number; oneOffCents?: number };
}
interface Resp {
  needsBalance?: boolean;
  balanceCents?: number;
  thresholdCents?: number;
  forecast?: CashForecast;
  scenarios?: Scenario[];
  activeScenarioId?: string | null;
  factors?: {
    startingBalanceCents: number;
    avgDailyNetCents: number;
    lookbackDays: number;
    daysWithActivity: number;
    plannedNetCents: number;
    manualSubsCents: number;
    thresholdCents: number;
  };
}

const inputStyle = {
  width: 180,
  border: "1px solid var(--line-2)",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 15,
  fontFamily: "inherit",
  outline: "none",
} as const;

const SparkIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M4.9 4.9l2.8 2.8M2 12h4" /><circle cx="12" cy="12" r="3" /></svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);

export function ForecastPanel({ locale = DEFAULT_LOCALE, variant = "business", currency = "EUR" }: { locale?: Locale; variant?: "business" | "personal"; currency?: string }) {
  const tr = translator(locale);
  const personal = variant === "personal";
  const tag = localeTag(locale);
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "short" });
  const fm = (c: number) => formatMoney(c, currency);
  const fmtK = (c: number) => `${Math.round(c / 100).toLocaleString(tag)} ${currencySymbol(currency)}`;
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [horizon, setHorizon] = useState<30 | 90>(30);
  const [scenario, setScenario] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [scnName, setScnName] = useState("");
  const [scnMonthly, setScnMonthly] = useState("");
  const [scnOneOff, setScnOneOff] = useState("");
  const [scnBusy, setScnBusy] = useState(false);

  async function load(h: 30 | 90 = horizon, sc: string | null = scenario) {
    setLoading(true);
    try {
      const r = await fetch(`/api/forecast?horizon=${h}${sc ? `&scenario=${sc}` : ""}`);
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(30, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchHorizon(h: 30 | 90) {
    setHorizon(h);
    void load(h);
  }

  function selectScenario(sc: string | null) {
    setScenario(sc);
    void load(horizon, sc);
  }

  async function createScenario() {
    const name = scnName.trim();
    if (!name) return;
    const monthly = parseFloat(scnMonthly.replace(",", "."));
    const oneOff = parseFloat(scnOneOff.replace(",", "."));
    setScnBusy(true);
    try {
      const r = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          monthlyDeltaCents: Number.isFinite(monthly) ? Math.round(monthly * 100) : 0,
          oneOffCents: Number.isFinite(oneOff) ? Math.round(oneOff * 100) : 0,
        }),
      });
      const d = await r.json();
      setShowNew(false);
      setScnName(""); setScnMonthly(""); setScnOneOff("");
      if (d.id) selectScenario(d.id);
      else void load();
    } finally {
      setScnBusy(false);
    }
  }

  async function deleteScenario(id: string) {
    await fetch(`/api/scenarios?id=${id}`, { method: "DELETE" });
    selectScenario(null);
  }

  async function saveBalance() {
    const euros = parseFloat(balanceInput.replace(",", "."));
    if (!Number.isFinite(euros) || euros < 0) return;
    const thrEuros = parseFloat(thresholdInput.replace(",", "."));
    setSaving(true);
    try {
      await fetch("/api/forecast/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          balanceCents: Math.round(euros * 100),
          thresholdCents: Number.isFinite(thrEuros) && thrEuros >= 0 ? Math.round(thrEuros * 100) : 0,
        }),
      });
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const Head = (
    <div className="panel-head">
      <h3>{personal ? tr("pf.headTitle") : tr("fc.headTitle")}</h3>
      <div className="seg">
        <button className={horizon === 30 ? "on" : ""} onClick={() => switchHorizon(30)}>{tr("fc.d30")}</button>
        <button className={horizon === 90 ? "on" : ""} onClick={() => switchHorizon(90)}>{tr("fc.d90")}</button>
      </div>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="panel">
        {Head}
        <p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("fc.loading")}</p>
      </div>
    );
  }

  if (data?.needsBalance || editing) {
    return (
      <div className="panel">
        {Head}
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 12 }}>
          {tr("fc.balancePrompt")}
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            <div style={{ marginBottom: 6 }}>{tr("fc.balLabel")}</div>
            <input autoFocus={editing} value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} placeholder="9000" style={inputStyle} />
          </label>
          <label style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            <div style={{ marginBottom: 6 }}>{tr("fc.thrLabel")}</div>
            <input value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} placeholder="5000" style={inputStyle} />
          </label>
          <button className="btn btn-dark" onClick={saveBalance} disabled={saving}>{saving ? tr("fc.saving") : tr("common.save")}</button>
          {editing && !data?.needsBalance && <button className="btn btn-line" onClick={() => setEditing(false)}>{tr("common.cancel")}</button>}
        </div>
      </div>
    );
  }

  const f = data?.forecast;
  if (!f || f.points.length < 2) return <div className="panel">{Head}<p style={{ color: "var(--ink-faint)", fontSize: 14 }}>{tr("fc.noData")}</p></div>;

  const pts = f.points;
  const at = (i: number) => pts[i]!;
  const n = pts.length;
  const PL = 58, PR = 700, PT = 28, PB = 238;

  const allVals: number[] = [f.thresholdCents];
  for (const p of pts) {
    allVals.push(p.balanceCents);
    if (p.loCents != null) allVals.push(p.loCents);
    if (p.hiCents != null) allVals.push(p.hiCents);
  }
  let vlo = Math.min(...allVals);
  let vhi = Math.max(...allVals);
  if (vlo === vhi) vhi = vlo + 100;
  const vpad = (vhi - vlo) * 0.08;
  vlo -= vpad;
  vhi += vpad;
  const xOf = (i: number) => PL + (i / (n - 1)) * (PR - PL);
  const yOf = (c: number) => PT + (1 - (c - vlo) / (vhi - vlo)) * (PB - PT);

  const boundary = pts.reduce((acc, p, i) => (p.kind === "actual" ? i : acc), 0);
  const fIdx = pts.map((_, i) => i).filter((i) => at(i).kind === "forecast");
  const actualIdx = pts.map((_, i) => i).filter((i) => at(i).kind === "actual");
  const gapIdx = f.gapDate ? pts.findIndex((p) => p.date === f.gapDate) : -1;

  const lineP = (idxs: number[], val: (p: ForecastPoint) => number) =>
    idxs.map((i, k) => `${k ? "L" : "M"} ${xOf(i).toFixed(1)},${yOf(val(at(i))).toFixed(1)}`).join(" ");

  const bal = (p: ForecastPoint) => p.balanceCents;
  const actualPath = lineP(actualIdx, bal);
  const areaPath = `${actualPath} L ${xOf(boundary).toFixed(1)},${PB} L ${xOf(actualIdx[0]!).toFixed(1)},${PB} Z`;

  const hiTop = `${`M ${xOf(boundary).toFixed(1)},${yOf(at(boundary).balanceCents).toFixed(1)}`} ${fIdx.map((i) => `L ${xOf(i).toFixed(1)},${yOf(at(i).hiCents ?? at(i).balanceCents).toFixed(1)}`).join(" ")}`;
  const loBack = [...fIdx].reverse().map((i) => `L ${xOf(i).toFixed(1)},${yOf(at(i).loCents ?? at(i).balanceCents).toFixed(1)}`).join(" ");
  const bandPath = `${hiTop} ${loBack} Z`;

  const forecastSegments: { d: string; color: string }[] = [];
  if (gapIdx >= 0) {
    const before = [boundary, ...fIdx.filter((i) => i <= gapIdx)];
    const after = [gapIdx, ...fIdx.filter((i) => i > gapIdx)];
    forecastSegments.push({ d: lineP(before, bal), color: "#C9C4B6" });
    forecastSegments.push({ d: lineP(after, bal), color: "var(--danger)" });
  } else {
    forecastSegments.push({ d: lineP([boundary, ...fIdx], bal), color: "var(--accent)" });
  }

  const lastIdx = n - 1;
  const showThreshold = f.thresholdCents > 0 || gapIdx >= 0;

  const scenarios = data?.scenarios ?? [];

  return (
    <div className="panel">
      {Head}

      <div className="scn-bar">
        <span className="scn-lbl">{tr("fc.scenario")}</span>
        <button className={`scn-chip ${!scenario ? "on" : ""}`} onClick={() => selectScenario(null)}>{tr("fc.base")}</button>
        {scenarios.map((s) => (
          <span key={s.id} className={`scn-chip ${scenario === s.id ? "on" : ""}`}>
            <button className="scn-pick" onClick={() => selectScenario(s.id)}>{s.name}</button>
            <button className="scn-del" title={tr("fc.delScenario")} onClick={() => deleteScenario(s.id)}>×</button>
          </span>
        ))}
        <button className="scn-chip scn-add" onClick={() => setShowNew((v) => !v)}>{tr("fc.addScenario")}</button>
        <button className="scn-help-btn" title={tr("fc.howWorks")} aria-label={tr("fc.howWorks")} onClick={() => setShowHelp((v) => !v)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" /><path d="M12 17h.01" /></svg>
          {tr("fc.howWorksShort")}
        </button>
      </div>

      {showHelp && (
        <div className="note info scn-help" style={{ marginBottom: 14 }}>
          <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span>{tr("fc.helpText")}</span>
        </div>
      )}

      {showNew && (
        <div className="scn-form">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{tr("fc.scnName")}</label>
            <input value={scnName} onChange={(e) => setScnName(e.target.value)} placeholder={tr("fc.scnNamePh")} />
            <div className="fhint">{tr("fc.scnNameHint")}</div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{tr("fc.scnMonthly")}</label>
            <input inputMode="decimal" value={scnMonthly} onChange={(e) => setScnMonthly(e.target.value)} placeholder={tr("fc.scnMonthlyPh")} />
            <div className="fhint">{tr("fc.scnMonthlyHint")}</div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{tr("fc.scnOneOff")}</label>
            <input inputMode="decimal" value={scnOneOff} onChange={(e) => setScnOneOff(e.target.value)} placeholder={tr("fc.scnOneOffPh")} />
            <div className="fhint">{tr("fc.scnOneOffHint")}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", paddingTop: 22 }}>
            <button className="btn btn-accent" style={{ padding: "10px 16px" }} disabled={scnBusy || !scnName.trim()} onClick={createScenario}>{scnBusy ? "…" : tr("common.save")}</button>
            <button className="btn btn-line" style={{ padding: "10px 16px" }} onClick={() => setShowNew(false)}>{tr("common.cancel")}</button>
          </div>
        </div>
      )}

      <div className="fc-stats">
        <div className="fc-stat">
          <div className="l">{tr("fc.nowBalance")}</div>
          <div className="v">{fm(data!.balanceCents!)}</div>
        </div>
        <div className="fc-stat">
          <div className="l"><SparkIcon />{tr("fc.inDaysForecast", { n: f.horizonDays })}</div>
          <div className="v" style={{ color: f.endDeltaCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>
            {fm(f.endBalanceCents)}{" "}
            <small style={{ color: f.endDeltaCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>
              {f.endDeltaCents >= 0 ? "▲" : "▼"} {f.endDeltaCents >= 0 ? "+" : ""}{Math.round(f.endDeltaCents / 100).toLocaleString(tag)}
            </small>
          </div>
        </div>
        <div className="fc-stat">
          <div className="l">{tr("fc.avgFlow")}</div>
          <div className="v" style={{ color: f.avgDailyNetCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>
            {f.avgDailyNetCents >= 0 ? "+" : ""}{fm(f.avgDailyNetCents)} <small>{tr("fc.perDay")}</small>
          </div>
        </div>
        <button className="fc-edit" onClick={() => { setBalanceInput((data!.balanceCents! / 100).toString()); setThresholdInput(((data!.thresholdCents ?? 0) / 100).toString()); setEditing(true); }}>
          <EditIcon />{tr("fc.editBalance")}
        </button>
      </div>

      <div className="fc-legend">
        <span><i className="solid" />{tr("fc.legFact")}</span>
        <span><i className="dash" />{tr("fc.legForecast")}</span>
        <span><i className="band" />{tr("fc.legRange")}</span>
        {showThreshold && <span><i className="thr" />{tr("fc.legThreshold")}</span>}
      </div>

      <svg viewBox="0 0 720 280" preserveAspectRatio="none" style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="fcArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1F7A5C" stopOpacity=".14" />
            <stop offset="1" stopColor="#1F7A5C" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g stroke="#ECEAE3" strokeWidth="1">
          {[0, 1, 2, 3].map((k) => {
            const y = PT + (k / 3) * (PB - PT);
            return <line key={k} x1={PL} y1={y} x2={PR} y2={y} />;
          })}
        </g>
        <g fontFamily="Inter" fontSize="11" fill="#8A8D96" textAnchor="end">
          {[0, 1, 2, 3].map((k) => {
            const y = PT + (k / 3) * (PB - PT);
            const v = vhi - (k / 3) * (vhi - vlo);
            return <text key={k} x={PL - 8} y={y + 4}>{fmtK(v)}</text>;
          })}
        </g>

        {showThreshold && (
          <>
            <line x1={PL} y1={yOf(f.thresholdCents)} x2={PR} y2={yOf(f.thresholdCents)} stroke="var(--danger)" strokeWidth="1.4" strokeDasharray="5 5" opacity=".6" />
            {f.thresholdCents > 0 && <text x={PL + 4} y={yOf(f.thresholdCents) - 5} fontFamily="Inter" fontSize="11" fill="var(--danger)">{tr("fc.thrShort", { v: fmtK(f.thresholdCents) })}</text>}
          </>
        )}

        <path d={bandPath} fill="var(--accent-soft)" opacity=".7" />
        <path d={areaPath} fill="url(#fcArea)" />
        <path d={actualPath} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
        {forecastSegments.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />
        ))}

        <circle cx={xOf(boundary)} cy={yOf(at(boundary).balanceCents)} r="5.5" fill="var(--accent)" />
        <circle cx={xOf(boundary)} cy={yOf(at(boundary).balanceCents)} r="10" fill="var(--accent)" opacity=".15" />
        <line x1={xOf(boundary)} y1={yOf(at(boundary).balanceCents) + 6} x2={xOf(boundary)} y2={PB} stroke="#C9C4B6" strokeWidth="1" strokeDasharray="3 4" />

        {gapIdx >= 0 ? (
          <>
            <circle cx={xOf(gapIdx)} cy={yOf(at(gapIdx).balanceCents)} r="6" fill="var(--danger)" />
            <circle cx={xOf(gapIdx)} cy={yOf(at(gapIdx).balanceCents)} r="11" fill="var(--danger)" opacity=".15" />
            <text x={xOf(gapIdx) - 6} y={yOf(at(gapIdx).balanceCents) + 22} fontFamily="Inter" fontSize="11" fill="var(--danger)" textAnchor="middle">{fmtDate(f.gapDate!)}</text>
          </>
        ) : (
          <>
            <circle cx={xOf(lastIdx)} cy={yOf(at(lastIdx).balanceCents)} r="5" fill="var(--accent)" />
            <circle cx={xOf(lastIdx)} cy={yOf(at(lastIdx).balanceCents)} r="9" fill="var(--accent)" opacity=".15" />
          </>
        )}
      </svg>
      <div className="fc-xrow">
        <span>{tr("fc.today")} · {fm(f.startingBalanceCents)}</span>
        <span>{fmtDate(at(lastIdx).date)} · {fm(f.endBalanceCents)}</span>
      </div>

      {f.gapDate ? (
        <div className="fc-note warn">
          <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
          <span>
            <strong>{personal ? tr("pf.lowTitle") : tr("fc.gapWarn", { date: fmtDate(f.gapDate) })}</strong> {tr("fc.gapBody", { bal: fm(f.gapBalanceCents ?? 0) })}
            {f.thresholdCents > 0 ? tr("fc.gapBelowThr", { thr: fm(f.thresholdCents) }) : ""}{tr("fc.gapAdvice")}
          </span>
        </div>
      ) : (
        <div className="fc-note ok">
          <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
          <span>
            <strong>{personal ? tr("pf.okTitle") : tr("fc.okTitle")}</strong> {tr("fc.okBody", { n: f.horizonDays })}
            {f.thresholdCents > 0 ? tr("fc.okAboveThr", { thr: fm(f.thresholdCents) }) : ""}.
          </span>
        </div>
      )}

      {f.daysWithActivity < 5 && (
        <div className="fc-cap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          {tr("fc.lowCap")}
          <span className="conf">{tr("fc.lowAcc")}</span>
        </div>
      )}

      {data.factors && (
        <div className="fc-factors">
          <div className="panel-head" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 14.5 }}>{tr("fcf.title")}</h3>
            <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{tr("fcf.note")}</span>
          </div>
          <div className="fcf-row">
            <span>{tr("fcf.balance")}</span>
            <b>{fm(data.factors.startingBalanceCents)}</b>
            <a href="/app">{tr("fcf.editMoney")}</a>
          </div>
          <div className="fcf-row">
            <span>{tr("fcf.avgNet", { n: data.factors.lookbackDays })}</span>
            <b style={{ color: data.factors.avgDailyNetCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>
              {data.factors.avgDailyNetCents >= 0 ? "+" : ""}{fm(data.factors.avgDailyNetCents)}/{tr("fc.perDay")}
            </b>
            <a href="/app/transactions">{tr("fcf.editTx")}</a>
          </div>
          <div className="fcf-row">
            <span>{tr("fcf.planned")}</span>
            <b style={{ color: data.factors.plannedNetCents >= 0 ? "var(--accent-ink)" : "var(--ink)" }}>
              {data.factors.plannedNetCents >= 0 ? "+" : "−"}{fm(Math.abs(data.factors.plannedNetCents))}
            </b>
            <a href="/app/calendar">{tr("fcf.editCal")}</a>
          </div>
          <div className="fcf-row">
            <span>{tr("fcf.manualSubs")}</span>
            <b>−{fm(data.factors.manualSubsCents)}</b>
            <a href="/app/subscriptions">{tr("fcf.editSubs")}</a>
          </div>
          <div className="fcf-row">
            <span>{tr("fcf.buffer")}</span>
            <b>{fm(data.factors.thresholdCents)}</b>
            <button className="scn-help-btn" style={{ padding: 0 }} onClick={() => setEditing(true)}>{tr("fc.editBalance")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
