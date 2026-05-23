import { cookies } from "next/headers";
import { translations, type Locale, type TranslationKeys } from "./translations";

type T = Record<keyof TranslationKeys, string>;

export function getServerLocale(): Locale {
  const cookieStore = cookies();
  const locale = cookieStore.get("pt_locale")?.value as Locale;
  if (locale && (["en", "zh", "ms"] as Locale[]).includes(locale)) return locale;
  return "en";
}

export function getServerTranslations(): T {
  return translations[getServerLocale()] as T;
}

export function getLocaleDateString(locale: Locale): string {
  const localeMap: Record<Locale, string> = {
    en: "en-MY",
    zh: "zh-CN",
    ms: "ms-MY",
  };
  return new Date().toLocaleDateString(localeMap[locale], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
