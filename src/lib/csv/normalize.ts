import { createHash } from "node:crypto";

export function parseAmountToCents(raw: string): number | null {
  let s = (raw ?? "").trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.includes("-")) negative = true;

  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return null;

  const fracMatch = s.match(/[.,](\d{1,2})$/);
  let decimals = "";
  let intStr = s;
  if (fracMatch) {
    decimals = fracMatch[1] ?? "";
    intStr = s.slice(0, s.length - fracMatch[0].length);
  }
  intStr = intStr.replace(/[^0-9]/g, "");
  if (intStr === "" && decimals === "") return null;

  const cents =
    parseInt(intStr || "0", 10) * 100 + parseInt((decimals + "00").slice(0, 2), 10);
  return negative ? -cents : cents;
}

const MONTHS: Record<string, number> = {
  січ: 1, янв: 1, jan: 1, ene: 1,
  лют: 2, фев: 2, feb: 2,
  бер: 3, мар: 3, mar: 3, mär: 3,
  квіт: 4, апр: 4, apr: 4, abr: 4,
  трав: 5, май: 5, мая: 5, may: 5, mai: 5, mayo: 5,
  черв: 6, июн: 6, jun: 6,
  лип: 7, июл: 7, jul: 7,
  серп: 8, авг: 8, aug: 8, ago: 8,
  вер: 9, сен: 9, sep: 9,
  жовт: 10, окт: 10, oct: 10, okt: 10,
  лист: 11, ноя: 11, nov: 11,
  груд: 12, дек: 12, dec: 12, dez: 12, dic: 12,
};

function monthFromWord(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  for (const [stem, num] of Object.entries(MONTHS)) {
    if (w === stem || w.startsWith(stem) || stem.startsWith(w)) return num;
  }
  return null;
}

export function parseDateFlexible(raw: string): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    const d = new Date(Date.UTC(+(iso[1] ?? 0), +(iso[2] ?? 1) - 1, +(iso[3] ?? 1)));
    return isNaN(d.getTime()) ? null : d;
  }

  const named = s.match(/^(\d{1,2})\s*([^\d\s.]+)\.?\s*(\d{4})/u);
  if (named) {
    const day = +(named[1] ?? 0);
    const month = monthFromWord(named[2] ?? "");
    const year = +(named[3] ?? 0);
    if (month) {
      const d = new Date(Date.UTC(year, month - 1, day));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    const a = +(dmy[1] ?? 0);
    const b = +(dmy[2] ?? 0);
    let year = +(dmy[3] ?? 0);
    if (year < 100) year += 2000;
    let day: number, month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    const d = new Date(Date.UTC(year, month - 1, day));
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

export function csvExternalId(dateIso: string, cents: number, desc: string): string {
  const h = createHash("sha1").update(`${dateIso}|${cents}|${desc}`).digest("hex");
  return `csv:${h.slice(0, 32)}`;
}
