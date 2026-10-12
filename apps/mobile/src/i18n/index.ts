import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '@bongah/shared-types';
import { KV_KEYS, kv } from '../storage/kv';
import { DEFAULT_LANGUAGE, isLanguage } from './languages';
import prs from './locales/prs.json';
import ps from './locales/ps.json';

export { LANGUAGE_META, DEFAULT_LANGUAGE, isLanguage } from './languages';

/** Pashto if the phone is set to Pashto, otherwise Dari (the app's default). */
function deviceLanguage(): Language {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (locale.startsWith('ps')) return 'ps';
  } catch {
    // Intl unavailable: fall through to the default.
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Starts i18next. Call once, and wait for it, before rendering anything translated.
 * The language is the one the user picked last time, else the phone's language, else Dari.
 */
export async function initI18n(): Promise<Language> {
  const saved = await kv.get(KV_KEYS.language);
  const language = isLanguage(saved) ? saved : deviceLanguage();

  await i18n.use(initReactI18next).init({
    resources: { prs: { translation: prs }, ps: { translation: ps } },
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
  });
  return language;
}

/** Both languages are RTL, so switching never needs a restart: only the strings change. */
export async function changeLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
  await kv.set(KV_KEYS.language, language);
}

export const currentLanguage = (): Language =>
  isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;

export default i18n;
