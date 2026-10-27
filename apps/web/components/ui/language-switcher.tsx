'use client';

import { LANGUAGES, LANGUAGE_META } from '@/i18n/config';
import { useLanguage, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';

/**
 * Dari | Pashto. Each name is written in its own script, so the other language can be found from either one. The
 * choice is saved in a cookie and the whole page is redrawn in the new language (see LanguageProvider).
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const t = useT();
  return (
    <div role="group" aria-label={t('language.switch')} data-testid="language-switcher" className={cn('inline-flex rounded-xl border border-line-strong bg-surface p-0.5', className)}>
      {LANGUAGES.map((code) => {
        const selected = language === code;
        return (
          <button
            key={code}
            type="button"
            lang={LANGUAGE_META[code].htmlLang}
            aria-pressed={selected}
            data-testid={`language-${code}`}
            onClick={() => setLanguage(code)}
            className={cn(
              'h-8 min-w-14 rounded-[10px] px-3 text-[13px] font-semibold transition-colors',
              selected ? 'bg-primary text-white' : 'text-ink-2 hover:bg-soft',
            )}
          >
            {LANGUAGE_META[code].nativeName}
          </button>
        );
      })}
    </div>
  );
}
