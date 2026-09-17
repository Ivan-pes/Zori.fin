import { parseAmountToCents, parseDateFlexible } from "../csv/normalize";
import { getLLM } from "@/lib/llm";
import { insertStatementRows } from "@/lib/import/insert";
import { type StatementRow } from "@/lib/import/dedup";
import type { ImportResult } from "../csv/import";

interface ExtractedTxn {
  date?: string;
  description?: string;
  amount?: string | number;
  currency?: string;
}

const SYSTEM =
  "Ты извлекаешь операции из банковской выписки. Возвращай ТОЛЬКО валидный JSON-массив, без пояснений и markdown.";

const PROMPT = `Извлеки ВСЕ операции из этой банковской выписки (она может быть на любом языке).
Для каждой операции верни объект СТРОГО в таком виде:
{"date":"YYYY-MM-DD","description":"<краткое описание / контрагент>","amount":"<число со знаком и точкой как десятичным разделителем>","currency":"<ISO-код валюты, напр. EUR>"}

ПРАВИЛА:
- "date" — обязательно в формате YYYY-MM-DD (преобразуй любые форматы и названия месяцев, в т.ч. украинские/испанские). Если есть две даты — бери дату операции (первую).
- "amount" — ОДНО число. Списания/расходы (колонка типа "Витрачені кошти"/"Debit"/"списано") — со знаком МИНУС. Поступления/зачисления (колонка "Внесені кошти"/"Credit"/"внесено") — со знаком ПЛЮС. Десятичный разделитель — точка, без символов валюты и пробелов (пример: -1447.70, 246.50).
- "currency" — валюта операции (для этой выписки обычно EUR).
- Бери ТОЛЬКО реальные операции. НЕ включай строки итогов, "Підсумок балансу", заголовки и сам остаток ("Баланс").
- НИЧЕГО не придумывай.

Верни ТОЛЬКО JSON-массив этих объектов.`;

export async function importBankPdf(
  orgIdOrIds: string | string[],
  base64: string
): Promise<ImportResult> {
  // Один дорогой LLM-парсинг → вставка в несколько пространств (личное+бизнес).
  const orgIds = Array.isArray(orgIdOrIds) ? orgIdOrIds : [orgIdOrIds];
  let raw: string;
  try {
    raw = await getLLM().readDocument({
      base64,
      mediaType: "application/pdf",
      system: SYSTEM,
      prompt: PROMPT,
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    console.error("[pdf] чтение документа не удалось:", err);
    if (/credit balance is too low/i.test(msg)) {
      return { imported: 0, skipped: 0, total: 0, method: "ai", error: "Закончились кредиты Anthropic API. Пополни баланс на console.anthropic.com → Plans & Billing и попробуй снова." };
    }
    if (/prompt is too long|maximum context|context length|too long/i.test(msg)) {
      return { imported: 0, skipped: 0, total: 0, method: "ai", error: "Файл слишком большой — это выписка за длинный период. Выгрузи выписку покороче (например, помесячно или за квартал) и загрузи несколько файлов." };
    }
    return { imported: 0, skipped: 0, total: 0, method: "ai", error: "Не удалось прочитать PDF. Попробуй другой файл или CSV." };
  }

  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) {
    return { imported: 0, skipped: 0, total: 0, method: "ai", error: "В файле не найдено операций. Проверь, что это банковская выписка." };
  }

  let items: ExtractedTxn[];
  try {
    items = JSON.parse(m[0]);
  } catch {
    return { imported: 0, skipped: 0, total: 0, method: "ai", error: "Не удалось разобрать данные из PDF. Попробуй CSV-выписку." };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { imported: 0, skipped: 0, total: 0, method: "ai", error: "В выписке не найдено операций." };
  }

  // Разбираем операции один раз (порядок сохраняем), вставляем в каждое
  // пространство с дедупликацией против банка и прошлых выписок.
  const parsed: StatementRow[] = [];
  let skipped = 0;
  for (const it of items) {
    const date = parseDateFlexible(String(it.date ?? ""));
    const cents = parseAmountToCents(String(it.amount ?? ""));
    if (!date || cents === null) {
      skipped++;
      continue;
    }
    const description = (it.description ?? "").toString().trim() || null;
    const currency = (it.currency ?? "").toString().trim().toUpperCase() || "EUR";
    parsed.push({ date, dateIso: date.toISOString().slice(0, 10), cents, currency, description });
  }

  let imported = 0;
  for (const orgId of orgIds) {
    const res = await insertStatementRows(orgId, parsed);
    imported += res.imported;
    skipped += res.skipped;
  }

  return { imported, skipped, total: items.length, method: "ai" };
}
