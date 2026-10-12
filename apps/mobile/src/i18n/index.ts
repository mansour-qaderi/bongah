import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import type { Language } from '@bongah/shared-types';
import fa from './locales/fa.json';
import ps from './locales/ps.json';
import en from './locales/en.json';

// fa = Dari, ps = Pashto
export const LANGUAGE_META: Record<Language, { label: string; rtl: boolean }> = {
  fa: { label: 'دری', rtl: true },
  ps: { label: 'پښتو', rtl: true },
  en: { label: 'English', rtl: false },
};

i18n.use(initReactI18next).init({
  resources: {
    fa: { translation: fa },
    ps: { translation: ps },
    en: { translation: en },
  },
  lng: 'fa',
  fallbackLng: 'fa',
  interpolation: { escapeValue: false },
});

/**
 * Switches language and the layout direction.
 * Returns true when the app must be reloaded for the direction change to apply.
 */
export function setLanguage(lang: Language): boolean {
  i18n.changeLanguage(lang);
  const rtl = LANGUAGE_META[lang].rtl;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return I18nManager.isRTL !== rtl;
}

export default i18n;
