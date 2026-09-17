import { parseCsv } from "./parse";
import { parseAmountToCents, parseDateFlexible } from "./normalize";
import { getLLM } from "@/lib/llm";
import { insertStatementRows } from "@/lib/import/insert";
import { type StatementRow } from "@/lib/import/dedup";

interface Mapping {
  date: number;
  description: number;
  amount?: number;
  debit?: number;
  credit?: number;
  currency?: number;
}

const SYN: Record<string, string[]> = {
  date: ["date", "дата", "datum", "data", "fecha", "день", "booking", "value date", "дата операции", "дата проводки", "дата платежа", "posted"],
  description: ["description", "назначение", "наименование", "описание", "verwendungszweck", "purpose", "details", "reference", "контрагент", "payee", "memo", "примечание", "comment", "concepto", "получатель", "отправитель", "narrative"],
  amount: ["amount", "сумма", "betrag", "importe", "montant", "сумма операции", "сумма платежа", "value", "оборот"],
  debit: ["debit", "дебет", "расход", "списание", "withdrawal", "paid out", "soll", "out", "outflow"],
  credit: ["credit", "кредит", "приход", "поступление", "зачисление", "deposit", "paid in", "haben", "inflow"],
  currency: ["currency", "валюта", "währung", "ccy"],
};

function matchHeader(header: string, keys: string[]): boolean {
  const h = header.toLowerCase().trim();
  return keys.some((k) => h === k || h.includes(k));
}

function detectMapping(headers: string[]): Mapping | null {
  const find = (cat: string): number | undefined => {
    const keys = SYN[cat] ?? [];
    const exact = headers.findIndex((h) => keys.includes(h.toLowerCase().trim()));
    if (exact !== -1) return exact;
    const partial = headers.findIndex((h) => matchHeader(h, keys));
    return partial === -1 ? undefined : partial;
  };

  const date = find("date");
  const description = find("description");
  const amount = find("amount");
  const debit = find("debit");
  const credit = find("credit");
  const currency = find("currency");

  if (date === undefined) return null;
  if (amount === undefined && debit === undefined && credit === undefined) return null;

  return {
    date,
    description: description ?? date,
    amount,
    debit,
    credit,
    currency,
  };
}

async function aiDetectMapping(
  headers: string[],
  sampleRows: string[][]
): Promise<Mapping | null> {
  const sample = sampleRows
    .slice(0, 3)
    .map((r) => headers.map((h, i) => `${h}=${r[i] ?? ""}`).join(" | "))
    .join("\n");

  const prompt = `Это заголовки и примеры строк банковской выписки (CSV).
Заголовки: ${headers.join(", ")}
Примеры строк:
${sample}

Определи, какие колонки за что отвечают. Верни СТРОГО JSON без пояснений:
{"date":"<точное название колонки с датой>","description":"<колонка с описанием/назначением>","amount":"<колонка с суммой со знаком, или пусто>","debit":"<колонка списаний, или пусто>","credit":"<колонка поступлений, или пусто>","currency":"<колонка валюты, или пусто>"}`;

  let raw: string;
  try {
    raw = await getLLM().complete({
      system: "Ты помогаешь распознать структуру CSV. Отвечай только валидным JSON.",
      messages: [{ role: "user", content: prompt }],
      tools: [],
      executeTool: async () => "",
    });
  } catch (err) {
    console.error("[csv] AI mapping failed:", err);
    return null;
  }

  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: Record<string, string>;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return null;
  }

  const idx = (name?: string): number | undefined => {
    if (!name) return undefined;
    const i = headers.findIndex((h) => h.toLowerCase().trim() === name.toLowerCase().trim());
    return i === -1 ? undefined : i;
  };

  const date = idx(obj.date);
  const amount = idx(obj.amount);
  const debit = idx(obj.debit);
  const credit = idx(obj.credit);
  if (date === undefined) return null;
  if (amount === undefined && debit === undefined && credit === undefined) return null;

  return {
    date,
    description: idx(obj.description) ?? date,
    amount,
    debit,
    credit,
    currency: idx(obj.currency),
  };
}

export interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  method: "rules" | "ai";
  error?: string;
}

export async function importBankCsv(
  orgId: string,
  text: string
): Promise<ImportResult> {
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0 || rows.length === 0) {
    return { imported: 0, skipped: 0, total: 0, method: "rules", error: "Файл пустой или не распознан." };
  }

  let mapping = detectMapping(headers);
  let method: "rules" | "ai" = "rules";
  if (!mapping) {
    mapping = await aiDetectMapping(headers, rows);
    method = "ai";
  }
  if (!mapping) {
    return {
      imported: 0,
      skipped: 0,
      total: rows.length,
      method,
      error: `Не удалось понять структуру файла. Колонки: ${headers.join(", ")}. Напиши, какая колонка — дата, какая — сумма, какая — описание.`,
    };
  }

  const MAX = 5000;
  let skipped = 0;
  const parsed: StatementRow[] = [];

  for (const row of rows.slice(0, MAX)) {
    const date = parseDateFlexible(row[mapping.date] ?? "");
    if (!date) {
      skipped++;
      continue;
    }

    let cents: number | null = null;
    if (mapping.amount !== undefined) {
      cents = parseAmountToCents(row[mapping.amount] ?? "");
    } else {
      const debit = mapping.debit !== undefined ? parseAmountToCents(row[mapping.debit] ?? "") : null;
      const credit = mapping.credit !== undefined ? parseAmountToCents(row[mapping.credit] ?? "") : null;
      if (debit !== null && Math.abs(debit) > 0) cents = -Math.abs(debit);
      else if (credit !== null && Math.abs(credit) > 0) cents = Math.abs(credit);
      else cents = 0;
    }
    if (cents === null) {
      skipped++;
      continue;
    }

    const description = (mapping.description !== undefined ? row[mapping.description] : "")?.trim() || null;
    const currency = (mapping.currency !== undefined ? row[mapping.currency] : "")?.trim().toUpperCase() || "EUR";
    parsed.push({ date, dateIso: date.toISOString().slice(0, 10), cents, currency, description });
  }

  // Вставка с дедупликацией против банка и прошлых выписок.
  const { imported, skipped: dupSkipped } = await insertStatementRows(orgId, parsed);
  return { imported, skipped: skipped + dupSkipped, total: rows.length, method };
}
