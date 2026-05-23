"use client";

import { useLanguage, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LANGUAGES: { code: Locale; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
  { code: "ms", label: "BM" },
];

export function LanguageSelector() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="flex items-center gap-1">
      {LANGUAGES.map((lang, i) => (
        <span key={lang.code} className="flex items-center gap-1">
          <button
            onClick={() => setLocale(lang.code)}
            className={cn(
              "text-xs px-1.5 py-0.5 rounded transition-colors",
              locale === lang.code
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {lang.label}
          </button>
          {i < LANGUAGES.length - 1 && (
            <span className="text-muted-foreground/30 text-xs">|</span>
          )}
        </span>
      ))}
    </div>
  );
}
