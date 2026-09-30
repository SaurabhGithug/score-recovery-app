"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Bilingual, Lang } from "./types";
import { getLanguage, setLanguage as persistLanguage } from "./storage";

type LangContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (b?: Bilingual | null | string) => string;
};

const LangContext = createContext<LangContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(getLanguage());
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    persistLanguage(l);
  };

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      t: (b?: Bilingual | null | string) => {
        if (!b) return "";
        if (typeof b === "string") return b;
        return (lang === "hi" ? b.hi : b.en) || b.en || b.hi || "";
      },
    }),
    [lang]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
