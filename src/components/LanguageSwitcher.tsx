"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";

const SHORT: Record<Locale, string> = { ru: "RU", uk: "UA", en: "EN", es: "ES" };

/**
 * Выпадающий выбор языка. drop="up" — меню раскрывается вверх
 * (для сайдбара, где кнопка у нижнего края экрана).
 */
export function LanguageSwitcher({
  current,
  variant = "light",
  drop = "down",
}: {
  current: Locale;
  variant?: "light" | "dark";
  drop?: "down" | "up";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(locale: Locale) {
    if (busy) return;
    setOpen(false);
    if (locale === current) return;
    setBusy(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className={`lang-dd ${variant}`} ref={ref}>
      <button
        type="button"
        className="lang-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{SHORT[current]}</span>
        <svg className={`chev${open ? " flip" : ""}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className={`lang-dd-menu ${drop}`} role="listbox" aria-label="Language">
          {LOCALES.map((l) => (
            <li key={l}>
              <button
                type="button"
                role="option"
                aria-selected={l === current}
                className={`lang-dd-item${l === current ? " on" : ""}`}
                onClick={() => void pick(l)}
              >
                <span className="cc">{SHORT[l]}</span>
                <span className="nm">{LOCALE_LABEL[l]}</span>
                {l === current && (
                  <svg className="ck" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
