"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EXPENSE_CATEGORIES } from "@/lib/categorize/categories";
import { categoryLabel } from "@/lib/i18n/categories";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

interface Fields {
  amountCents: number;
  merchant: string | null;
  dateIso: string | null;
  vatCents: number | null;
  currency: string;
  category: string;
  confidence: number;
}

const ACCEPT = "image/*,application/pdf";

export function ReceiptScanner({
  locale = DEFAULT_LOCALE,
  categories = [...EXPENSE_CATEGORIES],
}: {
  locale?: Locale;
  /** Категории орги (личные/бизнес + свои). */
  categories?: string[];
}) {
  const tr = translator(locale);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setSaved(false);
    setFields(null);
    setBusy(true);
    try {
      const res = await fetch("/api/receipts/extract", {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? tr("scan.errRecognize"));
        return;
      }
      setFields(data.fields as Fields);
    } catch {
      setError(tr("scan.netErr"));
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = "";
  }

  async function confirm() {
    if (!fields) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/receipts/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: fields.amountCents,
          merchant: fields.merchant,
          dateIso: fields.dateIso,
          currency: fields.currency,
          category: fields.category,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? tr("scan.errAdd"));
        return;
      }
      setSaved(true);
      setFields(null);
      router.refresh();
    } catch {
      setError(tr("scan.netErr"));
    } finally {
      setBusy(false);
    }
  }

  const amountStr = fields ? (fields.amountCents / 100).toFixed(2) : "";

  return (
    <div className="scan-grid">
      <div>
        <div
          className={`dropzone${dragOver ? " over" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={onPick} style={{ display: "none" }} />
          <div className="di">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.5" /></svg>
          </div>
          <h3>{busy && !fields ? tr("scan.recognizing") : tr("scan.dropHint")}</h3>
          <p>{tr("scan.formats")}</p>
        </div>

        {error && (
          <div className="note warn" style={{ marginTop: 14 }}>
            <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
            <span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="note ok" style={{ marginTop: 14 }}>
            <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
            <span>{tr("scan.added")}</span>
          </div>
        )}
        {!error && !saved && (
          <div className="note info" style={{ marginTop: 14 }}>
            <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            <span>{tr("scan.closesGap")}</span>
          </div>
        )}
      </div>

      {fields ? (
        <div className="parsed">
          <div className="parsed-top">
            <span className="who"><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34C58E", display: "inline-block" }} />{tr("scan.zoriRecognized")}</span>
            <span className="conf">{tr("scan.accuracy", { n: fields.confidence })}</span>
          </div>
          <div className="parsed-body">
            <div className="pf">
              <label>{tr("scan.fAmount")}</label>
              <div className="input big">
                <input
                  value={amountStr}
                  onChange={(e) => {
                    const v = Math.round(parseFloat(e.target.value.replace(",", ".")) * 100);
                    if (Number.isFinite(v)) setFields({ ...fields, amountCents: Math.abs(v) });
                  }}
                  inputMode="decimal"
                  style={{ border: "none", background: "transparent", font: "inherit", width: "60%", outline: "none" }}
                />
                <span className="ai-chip">{tr("scan.recognized")}</span>
              </div>
            </div>
            <div className="pf-row">
              <div className="pf">
                <label>{tr("scan.fMerchant")}</label>
                <div className="input">
                  <input
                    value={fields.merchant ?? ""}
                    onChange={(e) => setFields({ ...fields, merchant: e.target.value || null })}
                    placeholder={tr("scan.fMerchantPh")}
                    style={{ border: "none", background: "transparent", font: "inherit", width: "100%", outline: "none" }}
                  />
                </div>
              </div>
              <div className="pf">
                <label>{tr("tx.date")}</label>
                <div className="input">
                  <input
                    type="date"
                    value={fields.dateIso ?? ""}
                    onChange={(e) => setFields({ ...fields, dateIso: e.target.value || null })}
                    style={{ border: "none", background: "transparent", font: "inherit", width: "100%", outline: "none" }}
                  />
                </div>
              </div>
            </div>
            <div className="pf-row">
              <div className="pf">
                <label>{tr("scan.fVat")}</label>
                <div className="input"><span>{fields.vatCents != null ? `${(fields.vatCents / 100).toFixed(2)} ${fields.currency}` : "—"}</span></div>
              </div>
              <div className="pf">
                <label>{tr("scan.fCurrency")}</label>
                <div className="input">
                  <input
                    value={fields.currency}
                    onChange={(e) => setFields({ ...fields, currency: e.target.value.toUpperCase().slice(0, 8) })}
                    style={{ border: "none", background: "transparent", font: "inherit", width: "100%", outline: "none" }}
                  />
                </div>
              </div>
            </div>
            <div className="pf">
              <label>{tr("ov.thCat")}</label>
              <div className="cat-pick">
                {categories.map((c) => (
                  <span
                    key={c}
                    className={`c${fields.category === c ? " on" : ""}`}
                    onClick={() => setFields({ ...fields, category: c })}
                  >
                    {categoryLabel(c, locale)}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button className="btn btn-line btn-sm" style={{ flex: 1 }} onClick={() => { setFields(null); setError(null); }} disabled={busy}>{tr("common.cancel")}</button>
              <button className="btn btn-accent btn-sm" style={{ flex: 2 }} onClick={() => void confirm()} disabled={busy}>
                {busy ? tr("scan.adding") : tr("scan.addExpense")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="parsed parsed-empty">
          <p style={{ color: "var(--ink-faint)", fontSize: 13.5, textAlign: "center", maxWidth: "32ch" }}>
            {busy ? tr("scan.reading") : tr("scan.placeholder")}
          </p>
        </div>
      )}
    </div>
  );
}
