"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  method: "rules" | "ai";
  error?: string;
}

export interface ImportSpace {
  id: string;
  name: string;
  type: "personal" | "business";
}

export function CsvImport({
  label,
  locale = DEFAULT_LOCALE,
  spaces = [],
  currentOrgId,
  buttonClassName = "btn btn-accent btn-sm",
}: {
  label?: string;
  locale?: Locale;
  /** Все пространства пользователя — выписку можно загрузить в несколько сразу. */
  spaces?: ImportSpace[];
  currentOrgId?: string;
  /** Класс кнопки — второстепенный (btn-line) при живом подключении банка. */
  buttonClassName?: string;
}) {
  const tr = translator(locale);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  // Выбранные цели импорта; по умолчанию — текущее пространство.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(currentOrgId ? [currentOrgId] : [])
  );

  const showPicker = spaces.length > 1;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // хотя бы одна цель
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMsg(null);

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const qs = showPicker && selected.size > 0 ? `?targets=${[...selected].join(",")}` : "";

    try {
      const res = isPdf
        ? await fetch(`/api/bank/import-pdf${qs}`, {
            method: "POST",
            headers: { "Content-Type": "application/pdf" },
            body: file,
          })
        : await fetch(`/api/bank/import${qs}`, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: await file.text(),
          });
      const data: ImportResult = await res.json();
      if (!res.ok || data.error) {
        setMsg({ kind: "warn", text: data.error ?? tr("csv.importFailed") });
      } else {
        const skipped = data.skipped > 0 ? tr("csv.skipped", { n: data.skipped }) : "";
        setMsg({
          kind: "ok",
          text: tr("csv.imported", { n: data.imported, skipped }),
        });
        router.refresh();
      }
    } catch {
      setMsg({ kind: "warn", text: tr("csv.readError") });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      {showPicker && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", fontWeight: 600, marginBottom: 6 }}>
            {tr("csv.targets")}
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {spaces.map((s) => (
              <button
                key={s.id}
                className={`scn-chip ${selected.has(s.id) ? "on" : ""}`}
                onClick={() => toggle(s.id)}
                disabled={loading}
                title={s.type === "personal" ? tr("csv.spacePersonal") : tr("csv.spaceBusiness")}
              >
                {s.type === "personal" ? "👤" : "💼"} {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain,.pdf,application/pdf"
        style={{ display: "none" }}
        onChange={onFile}
      />
      <button
        className={buttonClassName}
        style={{ width: "100%" }}
        onClick={() => inputRef.current?.click()}
        disabled={loading || (showPicker && selected.size === 0)}
      >
        {loading ? tr("csv.importing") : (label ?? tr("int.uploadStatement"))}
      </button>
      {loading && (
        <div className="cap" style={{ marginTop: 8 }}>
          {tr("csv.pdfNote")}
        </div>
      )}
      {msg && (
        <div className={`note ${msg.kind === "ok" ? "ok" : "warn"}`} style={{ marginTop: 10 }}>
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}
