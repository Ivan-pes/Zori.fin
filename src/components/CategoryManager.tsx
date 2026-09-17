"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { formatMoneyShort } from "@/lib/format";
import { localeTag } from "@/lib/i18n";
import type { CustomCategoryUsage } from "@/lib/categorize/custom";

const L = {
  ru: {
    title: "Свои категории", add: "Добавить", ph: "Напр. Связь или Инвестиции",
    hint: "Своя категория появится в списках операций, бюджетах и у AI. ✎ — переименовать (перенесёт операции и конверты), × — удалить (операции уйдут в «уточнить категорию»).",
    delConfirm: (n: string) => `Удалить категорию «${n}»? Её операции останутся без категории.`,
    renamePrompt: (n: string) => `Новое имя для «${n}»:`,
    ops: (n: number) => `${n} оп.`,
  },
  en: {
    title: "My categories", add: "Add", ph: "E.g. Telecom or Investing",
    hint: "Custom categories appear in lists, budgets and AI. ✎ — rename (moves operations and envelopes), × — delete (operations go to the review queue).",
    delConfirm: (n: string) => `Delete category “${n}”? Its operations will lose the category.`,
    renamePrompt: (n: string) => `New name for “${n}”:`,
    ops: (n: number) => `${n} ops`,
  },
  es: {
    title: "Mis categorías", add: "Añadir", ph: "Ej. Telefonía o Inversión",
    hint: "Las categorías propias aparecen en listas, presupuestos y en la IA. ✎ — renombrar (mueve operaciones y sobres), × — eliminar (las operaciones quedan sin categoría).",
    delConfirm: (n: string) => `¿Eliminar la categoría «${n}»? Sus operaciones quedarán sin categoría.`,
    renamePrompt: (n: string) => `Nuevo nombre para «${n}»:`,
    ops: (n: number) => `${n} ops`,
  },
  uk: {
    title: "Свої категорії", add: "Додати", ph: "Напр. Зв'язок або Інвестиції",
    hint: "Своя категорія з'явиться у списках операцій, бюджетах і в AI. ✎ — перейменувати (перенесе операції та конверти), × — видалити (операції підуть в «уточнити категорію»).",
    delConfirm: (n: string) => `Видалити категорію «${n}»? Її операції залишаться без категорії.`,
    renamePrompt: (n: string) => `Нове ім'я для «${n}»:`,
    ops: (n: number) => `${n} оп.`,
  },
} as const;

export function CategoryManager({ custom, locale }: { custom: CustomCategoryUsage[]; locale: Locale }) {
  const t = L[locale] ?? L.ru;
  const tag = localeTag(locale);
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const money = (c: number) =>
    formatMoneyShort(c, "EUR", tag);

  async function call(method: string, body: unknown) {
    setBusy(true);
    try {
      await fetch("/api/categories", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    await call("POST", { name: n });
    setName("");
  }

  async function rename(from: string) {
    const to = window.prompt(t.renamePrompt(from), from)?.trim();
    if (!to || to === from) return;
    await call("PATCH", { from, to });
  }

  async function remove(n: string) {
    if (!window.confirm(t.delConfirm(n))) return;
    await call("DELETE", { name: n });
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>{t.title}</h3></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {custom.map((c) => (
          <span key={c.name} className="scn-chip on" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {c.name}
            {(c.txCount > 0 || c.monthCents > 0) && (
              <small style={{ color: "var(--ink-faint)", fontWeight: 500 }}>
                · {t.ops(c.txCount)}{c.monthCents > 0 ? ` · ${money(c.monthCents)}` : ""}
              </small>
            )}
            <button
              className="scn-help-btn"
              style={{ padding: 0, textDecoration: "none", fontSize: 13 }}
              onClick={() => rename(c.name)}
              disabled={busy}
              aria-label={`✎ ${c.name}`}
              title={t.renamePrompt(c.name)}
            >
              ✎
            </button>
            <button className="mm-del" style={{ fontSize: 15, padding: 0 }} onClick={() => remove(c.name)} disabled={busy} aria-label={`× ${c.name}`}>×</button>
          </span>
        ))}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t.ph}
          disabled={busy}
          style={{ fontFamily: "inherit", fontSize: 13, padding: "8px 11px", border: "1px solid var(--line-2)", borderRadius: 9, background: "var(--surface)", minWidth: 190 }}
        />
        <button className="cat-action" onClick={add} disabled={busy || !name.trim()}>+ {t.add}</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 10 }}>{t.hint}</p>
    </div>
  );
}
