'use client';

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveLanguage } from './active';
import { useActiveMarket } from '@/hooks/use-active-market';
import { LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE, htmlLangFor, isLanguage, type Language } from './config';
import { translatorFor, type Translator } from './translate';

interface LanguageContextValue {
  language: Language;
  t: Translator;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Holds the page's language. It starts as the language the server rendered (from the cookie), so the first paint and
 * the first client render agree. Choosing another language saves the cookie, switches the strings and REMOUNTS
 * everything below (`key`), so that every label, formatter and cached text is rebuilt in one go instead of some of it
 * staying in the old language. Data (SWR's cache) lives above this and is kept, so nothing is fetched again.
 */
export function LanguageProvider({ initialLanguage, children }: { initialLanguage: Language; children: ReactNode }) {
  const router = useRouter();
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const market = useActiveMarket();

  // Before any child renders, so a formatter called during that render already sees the right language.
  setActiveLanguage(language);

  useEffect(() => {
    document.documentElement.lang = htmlLangFor(language, market);
    document.documentElement.dir = 'rtl'; // both languages are right-to-left
  }, [language, market]);

  const setLanguage = useCallback(
    (next: Language) => {
      if (!isLanguage(next) || next === language) return;
      try {
        document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE}; samesite=lax`;
      } catch {
        /* cookies blocked: the choice lasts until the tab is closed */
      }
      setActiveLanguage(next);
      setLanguageState(next);
      router.refresh(); // the server-rendered parts (page title) read the new cookie
    },
    [language, router],
  );

  const value = useMemo<LanguageContextValue>(() => ({ language, t: translatorFor(language), setLanguage }), [language, setLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      <Fragment key={language}>{children}</Fragment>
    </LanguageContext.Provider>
  );
}

function useLanguageContext(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useT/useLanguage must be used inside <LanguageProvider>.');
  return value;
}

/** The translator for the page's language, for words that are rendered. */
export const useT = (): Translator => useLanguageContext().t;

/** The current language and how to change it (the switcher). */
export function useLanguage(): { language: Language; setLanguage: (language: Language) => void } {
  const { language, setLanguage } = useLanguageContext();
  return { language, setLanguage };
}
