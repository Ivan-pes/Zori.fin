export type Locale = "ru" | "uk" | "en" | "es";

export const LOCALES: Locale[] = ["en", "uk", "es", "ru"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

export const LOCALE_LABEL: Record<Locale, string> = {
  ru: "Русский",
  uk: "Українська",
  en: "English",
  es: "Español",
};

export function isLocale(x: string | undefined | null): x is Locale {
  return x === "ru" || x === "uk" || x === "en" || x === "es";
}

const TAG: Record<Locale, string> = { ru: "ru-RU", uk: "uk-UA", en: "en-US", es: "es-ES" };
export function localeTag(locale: Locale): string {
  return TAG[locale];
}

export function getClientLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const m = document.cookie.match(/(?:^|;\s*)lang=(ru|uk|en|es)/);
  return isLocale(m?.[1]) ? (m![1] as Locale) : DEFAULT_LOCALE;
}
