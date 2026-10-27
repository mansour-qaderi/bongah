import { LANGUAGES, type Language } from '@bongah/shared-types';

export { LANGUAGES };
export type { Language };

/** Dari is the default (and what the panel was written in); Pashto is the other language the product supports, as in the mobile app. */
export const DEFAULT_LANGUAGE: Language = 'prs';

/** The cookie that remembers the choice. Readable by the server, so the first paint is already in the right language. */
export const LANGUAGE_COOKIE = 'bongah_lang';
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * `nativeName` is always written in its own script, so a person can find their language even when the page is in the
 * other one. Both languages are right-to-left, so the layout direction never changes with the language.
 * `intl` is the locale handed to Intl for names of months and the like.
 */
export const LANGUAGE_META: Record<Language, { nativeName: string; htmlLang: string; intl: string }> = {
  prs: { nativeName: 'دری', htmlLang: 'fa-AF', intl: 'fa-AF' },
  ps: { nativeName: 'پښتو', htmlLang: 'ps-AF', intl: 'ps-AF' },
};

export const isLanguage = (value: unknown): value is Language => (LANGUAGES as readonly unknown[]).includes(value);

/** Anything that is not one of the supported languages (an old cookie, a typo) becomes the default. */
export const toLanguage = (value: unknown): Language => (isLanguage(value) ? value : DEFAULT_LANGUAGE);
