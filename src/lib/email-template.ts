import { translator } from "./i18n/dictionaries";
import type { Locale } from "./i18n";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export interface ShellOpts {
  heading: string;
  subheading?: string;
  intro?: string;
  contentHtml?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footnote?: string;
  preheader?: string;
  locale?: Locale; // язык письма; по умолчанию ru (исторические письма на русском)
}

const C = {
  bg: "#F4F2EC",
  card: "#FFFFFF",
  ink: "#16181C",
  inkSoft: "#52555E",
  inkFaint: "#8A8D96",
  line: "#ECEAE3",
  accent: "#1F7A5C",
  accentInk: "#0E5A41",
};

export function emailShell(o: ShellOpts): string {
  const lang = o.locale ?? "ru";
  const footerText = translator(lang)("mail.footer");
  const preheader = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(o.preheader)}</div>`
    : "";

  const intro = o.intro
    ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${C.inkSoft}">${escapeHtml(o.intro)}</p>`
    : "";

  const cta =
    o.ctaUrl && o.ctaLabel
      ? `<a href="${o.ctaUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:13px 24px;border-radius:10px;margin:6px 0 4px">${escapeHtml(o.ctaLabel)}</a>`
      : "";

  const footnote = o.footnote
    ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:${C.inkFaint}">${o.footnote}</p>`
    : "";

  const subheading = o.subheading
    ? `<div style="font-size:13px;color:${C.inkFaint};margin:4px 0 18px">${escapeHtml(o.subheading)}</div>`
    : `<div style="height:14px"></div>`;

  return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.bg}">
  ${preheader}
  <div style="background:${C.bg};padding:28px 16px">
    <div style="max-width:540px;margin:0 auto;background:${C.card};border:1px solid ${C.line};border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <!-- шапка -->
      <div style="padding:20px 28px;border-bottom:1px solid ${C.line}">
        <span style="display:inline-block;width:26px;height:26px;border-radius:7px;background:${C.ink};color:#fff;text-align:center;line-height:26px;font-weight:700;font-size:15px;vertical-align:middle">Z</span>
        <span style="font-size:17px;font-weight:600;color:${C.ink};vertical-align:middle;margin-left:9px;letter-spacing:-0.02em">Zori</span>
      </div>
      <!-- контент -->
      <div style="padding:26px 28px">
        <h1 style="margin:0;font-size:21px;font-weight:600;color:${C.ink};letter-spacing:-0.02em">${escapeHtml(o.heading)}</h1>
        ${subheading}
        ${intro}
        ${o.contentHtml ?? ""}
        ${cta}
        ${footnote}
      </div>
      <!-- подвал -->
      <div style="padding:16px 28px;border-top:1px solid ${C.line};font-size:11.5px;color:${C.inkFaint};line-height:1.5">
        ${escapeHtml(footerText)}
      </div>
    </div>
  </div>
</body></html>`;
}
