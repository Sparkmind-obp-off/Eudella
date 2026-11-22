// Localisation-ready architecture: every UI string used for navigation, headings and primary
// actions goes through t(). English is complete; Indonesian covers navigation, headings and
// primary actions. Missing keys fall back to English.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { en, type Dict } from "./en";
import { id } from "./id";

export type Locale = "en" | "id";
const DICTS: Record<Locale, Partial<Dict>> = { en, id };

interface I18n { locale: Locale; setLocale: (l: Locale) => void; t: (k: keyof Dict, vars?: Record<string, string | number>) => string }
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => (localStorage.getItem("eud_locale") === "id" ? "id" : navigator.language?.startsWith("id") && !localStorage.getItem("eud_locale") ? "id" : "en"));
  const value = useMemo<I18n>(() => ({
    locale,
    setLocale: (l) => { localStorage.setItem("eud_locale", l); document.documentElement.lang = l; setLocaleState(l); },
    t: (k, vars) => {
      let s = (DICTS[locale][k] ?? en[k]) as string;
      if (vars) for (const [vk, vv] of Object.entries(vars)) s = s.replace(`{${vk}}`, String(vv));
      return s;
    },
  }), [locale]);
  document.documentElement.lang = locale;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("I18nProvider missing");
  return v;
}
