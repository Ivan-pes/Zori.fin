"use client";

import { useEffect, useRef, useState } from "react";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";

export function ReportSummary({ week, locale = DEFAULT_LOCALE }: { week: number; locale?: Locale }) {
  const tr = translator(locale);
  const tag = localeTag(locale);
  function fmtWhen(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return tr("rs.today", { time: d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" }) });
    return d.toLocaleDateString(tag, { day: "numeric", month: "long" });
  }
  const [summary, setSummary] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const reqRef = useRef(0);

  function load(force: boolean) {
    const id = ++reqRef.current;
    const setBusy = force ? setRefreshing : setLoading;
    setBusy(true);
    fetch(`/api/reports/summary?week=${week}${force ? "&refresh=1" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (reqRef.current !== id) return;
        setSummary(typeof d.summary === "string" ? d.summary : null);
        setGeneratedAt(d.generatedAt ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (reqRef.current === id) setBusy(false);
      });
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  if (loading) return <div className="rep-summary loading">{tr("rs.formulating")}</div>;
  if (!summary) return null;

  return (
    <div className="rep-summary">
      <div>{summary}</div>
      <div className="rep-summary-foot">
        {generatedAt && <span>{tr("rs.updated", { when: fmtWhen(generatedAt) })}</span>}
        <button type="button" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? tr("rs.refreshing") : tr("rs.refresh")}
        </button>
      </div>
    </div>
  );
}
