"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { translations, type Locale, type TranslationKeys } from "./translations";

export type { Locale };
export { translations };

type T = Record<keyof TranslationKeys, string>;

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: T;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: "en",
  setLocale: () => {},
  t: translations.en as T,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = document.cookie
      .split("; ")
      .find((row) => row.startsWith("pt_locale="))
      ?.split("=")[1] as Locale | undefined;
    if (saved && (["en", "zh", "ms"] as Locale[]).includes(saved)) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    document.cookie = `pt_locale=${l};path=/;max-age=31536000;SameSite=Lax`;
    router.refresh();
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: translations[locale] as T }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
