"use client";

import { useState } from "react";
import { computeAffordability } from "@/lib/metrics/affordability";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";
import { currencySymbol } from "@/lib/currency";

export function AffordabilitySim({
  avgDailyNetCents,
  balanceCents,
  thresholdCents,
  currency = "EUR",
  locale = DEFAULT_LOCALE,
}: {
  avgDailyNetCents: number;
  balanceCents: number;
  thresholdCents: number;
  currency?: string;
  locale?: Locale;
}) {
  const tr = translator(locale);
  const [amount, setAmount] = useState(450);
  const [amountStr, setAmountStr] = useState("450");
  const [recurring, setRecurring] = useState(true);
  // Ползунок растёт вслед за введённой суммой — 2000 по умолчанию мало для UAH и др.
  const sliderMax = Math.max(2000, Math.ceil(amount / 1000) * 1000);

  function applyAmount(raw: string) {
    const digits = raw.replace(/[^\d]/g, "").slice(0, 9);
    setAmountStr(digits);
    setAmount(digits === "" ? 0 : parseInt(digits, 10));
  }
  const sym = currencySymbol(currency);
  const money = (cents: number) => {
    const v = (cents / 100).toLocaleString(localeTag(locale), { maximumFractionDigits: 0 });
    return sym ? `${sym}${v}` : `${v} ${currency}`;
  };

  const res = computeAffordability({
    amountCents: amount * 100,
    recurring,
    avgDailyNetCents,
    balanceCents,
    thresholdCents,
  });
  const ok = res.verdict === "ok";
  const dayFmt = (c: number) => `${c >= 0 ? "+" : "−"}${money(Math.abs(c))}${tr("af.perDay")}`;
  const runway = res.newRunwayMonths === null ? "∞" : tr("af.runwayMonths", { n: res.newRunwayMonths.toFixed(1) });

  return (
    <div className="afford">
      <div className="ctrl">
        <label>{recurring ? tr("af.monthlyExp") : tr("af.oneoffExp")}</label>
        <div className="val">
          {sym && <span className="val-sym">{sym}</span>}
          <input
            className="val-in"
            inputMode="numeric"
            value={amountStr}
            onChange={(e) => applyAmount(e.target.value)}
            onBlur={() => amountStr === "" && applyAmount("0")}
            style={{ width: `${Math.max(1, amountStr.length || 1)}ch` }}
            aria-label={recurring ? tr("af.monthlyExp") : tr("af.oneoffExp")}
          />
          {!sym && <span className="val-sym">{currency}</span>}
          <span style={{ fontSize: 14, color: "var(--ink-faint)" }}>{recurring ? tr("af.perMonth") : ""}</span>
        </div>
        <input type="range" min={0} max={sliderMax} step={10} value={Math.min(amount, sliderMax)} onChange={(e) => { setAmount(+e.target.value); setAmountStr(String(e.target.value)); }} />
        <div className="seg" style={{ marginTop: 16 }}>
          <button className={recurring ? "on" : ""} onClick={() => setRecurring(true)}>{tr("af.monthly")}</button>
          <button className={!recurring ? "on" : ""} onClick={() => setRecurring(false)}>{tr("af.oneoff")}</button>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 12 }}>
          {tr("af.eg")}
        </div>
      </div>

      <div className={`verdict ${ok ? "ok" : "risk"}`}>
        <div className="vh">{ok ? tr("af.canAfford") : tr("af.risky")}</div>
        <p>{ok ? tr("af.okText") : tr("af.riskText")}</p>
        <div className="row">
          <div><b style={{ color: res.oldDailyFlowCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>{dayFmt(res.oldDailyFlowCents)}</b><span>{tr("af.was")}</span></div>
          <div><b style={{ color: res.newDailyFlowCents >= 0 ? "var(--accent-ink)" : "var(--danger)" }}>{dayFmt(res.newDailyFlowCents)}</b><span>{tr("af.becomes")}</span></div>
          <div><b style={{ color: res.newRunwayMonths === null ? "var(--accent-ink)" : undefined }}>{runway}</b><span>runway</span></div>
        </div>
      </div>
    </div>
  );
}
