"use client";

import { useState, useEffect } from "react";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

interface Props {
  connected: boolean;
  hasTransactions: boolean;
  balanceSet: boolean;
  preview?: boolean;
  locale?: Locale;
}

const STORAGE_KEY = "zori_onboarding_dismissed";

export function OnboardingChecklist({ connected, hasTransactions, balanceSet, preview = false, locale = DEFAULT_LOCALE }: Props) {
  const tr = translator(locale);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") setDismissed(true);
  }, []);

  const fresh = !connected && !hasTransactions;
  if (!preview && (!fresh || dismissed)) return null;

  const isConnected = preview ? false : connected;
  const isBalanceSet = preview ? false : balanceSet;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  function scrollToForecast() {
    document.getElementById("cash-forecast")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const steps = [
    { done: true, title: tr("onb.step1Title"), desc: tr("onb.step1Desc") },
    {
      done: isConnected,
      title: tr("onb.step2Title"),
      desc: tr("onb.step2Desc"),
    },
    {
      done: isBalanceSet,
      title: tr("onb.step3Title"),
      desc: tr("onb.step3Desc"),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="onb">
      <button className="onb-x" onClick={dismiss} aria-label={tr("onb.hide")} type="button">✕</button>

      <div className="onb-head">
        <span className="eyebrow"><span className="dot" />{tr("onb.firstSteps")}</span>
        <h2>{tr("onb.title")}</h2>
        <p>{tr("onb.sub")}</p>
      </div>

      <div className="onb-progress" aria-hidden="true">
        <i style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <div className="onb-progress-lbl">{tr("onb.progress", { done: doneCount, total: steps.length })}</div>

      <ol className="onb-steps">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? "done" : ""}>
            <span className="onb-num">{s.done ? "✓" : i + 1}</span>
            <div className="onb-step-body">
              <b>{s.title}</b>
              <span>{s.desc}</span>
              {i === 1 && !s.done && (
                <div className="onb-actions">
                  <a className="btn btn-accent" href="/api/stripe/connect">{tr("onb.connectStripe")}</a>
                  <a className="onb-link" href="/demo">{tr("onb.seeDemo")}</a>
                </div>
              )}
              {i === 2 && !s.done && (
                <div className="onb-actions">
                  <button className="btn btn-line" type="button" onClick={scrollToForecast}>
                    {tr("onb.setBalance")}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
