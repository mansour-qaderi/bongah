import { useTranslation } from 'react-i18next';
import type { Currency, Language } from '@bongah/shared-types';
import { provinceLabel } from '../constants/provinces';
import { DEFAULT_LANGUAGE, isLanguage } from './languages';
import { formatNumber, formatPrice, sqmToJerib } from './format';

/** Number/price/area formatting bound to the current language. */
export function useFormat() {
  const { t, i18n } = useTranslation();
  // useTranslation re-renders on language change, so this stays current.
  const language: Language = isLanguage(i18n.language)
    ? i18n.language
    : DEFAULT_LANGUAGE;
  return {
    language,
    price: (amount: number, currency: Currency) =>
      formatPrice(amount, t(`currency.${currency}`)),
    area: (sqm: number) => `${formatNumber(sqm)} ${t('unit.sqm')}`,
    jerib: (sqm: number) =>
      `${formatNumber(sqmToJerib(sqm))} ${t('unit.jerib')}`,
    province: (value: string) => provinceLabel(value, language),
  };
}
