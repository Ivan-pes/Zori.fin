"use client";

import { useEffect, useState } from "react";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, localeTag, type Locale } from "@/lib/i18n";

interface Institution {
  id: string;
  name: string;
  bic: string | null;
  logo: string | null;
}

const COUNTRY_CODES = ["DE", "FR", "ES", "IT", "NL", "PT", "IE", "PL", "AT", "BE", "FI", "GB"] as const;

export function BankConnect({
  defaultCountry = "ES",
  locale = DEFAULT_LOCALE,
  variant = "card",
}: {
  defaultCountry?: string;
  locale?: Locale;
  variant?: "card" | "hero";
}) {
  const tr = translator(locale);
  const regionNames = new Intl.DisplayNames([localeTag(locale)], { type: "region" });
  const COUNTRIES = COUNTRY_CODES.map((code) => [code, regionNames.of(code) ?? code] as const);
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState(defaultCountry.toUpperCase());
  const [query, setQuery] = useState("");
  const [banks, setBanks] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/bank/institutions?country=${country}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        if (!cancelled) setBanks(d.institutions ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(tr("bc.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, country]);

  async function connect(bank: Institution) {
    setConnecting(bank.id);
    setError(null);
    try {
      const res = await fetch("/api/bank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: bank.id, institutionName: bank.name, country }),
      });
      const data = await res.json();
      if (!res.ok || !data.link) throw new Error(data.error ?? "no link");
      window.location.href = data.link;
    } catch {
      setError(tr("bc.connectError"));
      setConnecting(null);
    }
  }

  const filtered = query.trim()
    ? banks.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))
    : banks;

  return (
    <>
      {variant === "hero" ? (
        <button className="btn bh-cta-btn" onClick={() => setOpen(true)}>
          {tr("int.bankHeroCta")}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      ) : (
        <button
          className="btn btn-accent btn-sm"
          style={{ width: "100%" }}
          onClick={() => setOpen(true)}
        >
          {tr("int.connect")}
        </button>
      )}

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>{tr("bc.chooseBank")}</b>
              <button className="modal-x" onClick={() => setOpen(false)} aria-label={tr("cal.close")}>
                ✕
              </button>
            </div>

            <div className="modal-controls">
              <select
                className="modal-select"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                {COUNTRIES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                className="modal-search"
                placeholder={tr("bc.searchPh")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {error && <div className="note warn" style={{ margin: "0 0 12px" }}>{error}</div>}

            <div className="bank-list">
              {loading ? (
                <div className="cap" style={{ padding: 16 }}>{tr("bc.loading")}</div>
              ) : filtered.length === 0 ? (
                <div className="cap" style={{ padding: 16 }}>{tr("bc.notFound")}</div>
              ) : (
                filtered.map((b) => (
                  <button
                    key={b.id}
                    className="bank-row"
                    onClick={() => connect(b)}
                    disabled={connecting !== null}
                  >
                    {b.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.logo} alt="" width={28} height={28} style={{ borderRadius: 6 }} />
                    ) : (
                      <span className="bank-ic">{b.name.slice(0, 1)}</span>
                    )}
                    <span className="bank-name">{b.name}</span>
                    <span className="cap">{connecting === b.id ? "…" : "→"}</span>
                  </button>
                ))
              )}
            </div>

            <div className="cap" style={{ marginTop: 12 }}>
              {tr("bc.redirectNote")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
