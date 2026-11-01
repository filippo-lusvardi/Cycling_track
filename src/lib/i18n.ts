// UI language. Each string carries both translations inline: t("Rides", "Attività").
import { format as formatDate } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { LANGUAGE, readSetting, writeSetting } from "./settings";

export type Lang = "en" | "it";

function initialLang(): Lang {
  const saved = readSetting<Lang>(LANGUAGE);
  if (saved === "en" || saved === "it") return saved;
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("it")
    ? "it"
    : "en";
}

/** Fixed for the page's lifetime: switching language reloads, so no string has to be reactive. */
export const lang: Lang = initialLang();

if (typeof document !== "undefined") document.documentElement.lang = lang;

export const t = (en: string, it: string) => (lang === "it" ? it : en);

export function setLang(next: Lang) {
  if (next === lang) return;
  writeSetting(LANGUAGE, next);
  window.location.reload();
}

/** date-fns `format` in the UI language. Italian names are lowercase, so the first letter is capitalised. */
export function format(date: Date | number | string, pattern: string) {
  if (lang !== "it") return formatDate(date, pattern);
  const s = formatDate(date, pattern, { locale: itLocale });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Number with the UI language's thousands separator. */
export const num = (n: number) => n.toLocaleString(lang === "it" ? "it-IT" : "en-GB");
