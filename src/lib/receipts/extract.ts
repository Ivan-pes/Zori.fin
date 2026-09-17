import { parseAmountToCents, parseDateFlexible } from "../csv/normalize";
import { getLLM } from "@/lib/llm";
import { EXPENSE_CATEGORIES, categorizeByRulesFor } from "@/lib/categorize/categories";

export interface ReceiptFields {
  amountCents: number;
  merchant: string | null;
  dateIso: string | null;
  vatCents: number | null;
  currency: string;
  category: string;
  confidence: number;
}

export type ReceiptResult =
  | { ok: true; fields: ReceiptFields }
  | { ok: false; error: string };

const SYSTEM =
  "Ты извлекаешь данные из чека/счёта/инвойса (фото или PDF). Возвращай ТОЛЬКО валидный JSON-объект, без пояснений и markdown.";

const promptFor = (categories: readonly string[]) => `Распознай этот чек/счёт и верни ОДИН JSON-объект СТРОГО такого вида:
{"amount":"<итоговая сумма к оплате, число с точкой, без знака и валюты>","merchant":"<название продавца>","date":"YYYY-MM-DD","vat":"<сумма НДС/VAT числом или null>","currency":"<ISO-код, напр. EUR>","category":"<одна из категорий>","confidence":<число 0-100>}

ПРАВИЛА:
- "amount" — ИТОГОВАЯ сумма (Total / Итого / К оплате), одно число с точкой как десятичным разделителем, без символа валюты.
- "date" — дата чека в формате YYYY-MM-DD.
- "vat" — сумма налога (VAT/НДС/IVA), если указана; иначе null.
- "currency" — ISO-код валюты чека (по символу € → EUR, $ → USD и т.п.).
- "category" — выбери ОДНУ наиболее подходящую из списка: ${categories.join(", ")}.
- "confidence" — насколько уверенно распознано (0-100).
- НИЧЕГО не придумывай: если поле не видно, ставь null (кроме category — там подбери ближайшую).

Верни ТОЛЬКО JSON-объект.`;

interface RawReceipt {
  amount?: string | number;
  merchant?: string;
  date?: string;
  vat?: string | number | null;
  currency?: string;
  category?: string;
  confidence?: number;
}

export interface ExtractOptions {
  /** Категории орги (личные/бизнес + свои) — LLM выбирает из них. */
  categories?: readonly string[];
  accountType?: "business" | "personal";
}

export async function extractReceipt(
  base64: string,
  mediaType: string,
  opts: ExtractOptions = {}
): Promise<ReceiptResult> {
  const categories = opts.categories?.length ? opts.categories : EXPENSE_CATEGORIES;

  let raw: string;
  try {
    raw = await getLLM().readDocument({ base64, mediaType, system: SYSTEM, prompt: promptFor(categories) });
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    console.error("[receipt] чтение не удалось:", err);
    if (/credit balance is too low/i.test(msg)) {
      return { ok: false, error: "Закончились кредиты Anthropic API. Пополни баланс и попробуй снова." };
    }
    return { ok: false, error: "Не удалось распознать чек. Попробуй другое фото (почётче) или PDF." };
  }

  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "На фото не найден чек. Убедись, что виден итог и продавец." };

  let it: RawReceipt;
  try {
    it = JSON.parse(m[0]);
  } catch {
    return { ok: false, error: "Не удалось разобрать данные чека. Попробуй другое фото." };
  }

  const cents = parseAmountToCents(String(it.amount ?? ""));
  if (cents === null || cents === 0) {
    return { ok: false, error: "Не удалось распознать сумму. Введи её вручную или сними чёткое фото." };
  }
  const date = parseDateFlexible(String(it.date ?? ""));
  const vat = it.vat != null && it.vat !== "" ? parseAmountToCents(String(it.vat)) : null;
  const merchant = (it.merchant ?? "").toString().trim() || null;

  // Категория: ответ LLM из списка → детерминированные правила по мерчанту → Прочее.
  let category =
    it.category && categories.includes(it.category) && it.category !== "Прочее" ? it.category : null;
  if (!category && merchant) {
    category = categorizeByRulesFor(opts.accountType ?? "business", merchant, "adjustment");
  }
  category = category ?? "Прочее";

  return {
    ok: true,
    fields: {
      amountCents: Math.abs(cents),
      merchant,
      dateIso: date ? date.toISOString().slice(0, 10) : null,
      vatCents: vat !== null ? Math.abs(vat) : null,
      currency: (it.currency ?? "EUR").toString().trim().toUpperCase() || "EUR",
      category,
      confidence: typeof it.confidence === "number" ? Math.max(0, Math.min(100, it.confidence)) : 90,
    },
  };
}
