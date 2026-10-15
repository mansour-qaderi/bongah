import { useTranslation } from 'react-i18next';
import type { Currency, Language } from '@bongah/shared-types';
import { provinceLabel } from '../constants/provinces';
import { DEFAULT_LANGUAGE, isLanguage } from './languages';
import {
  compactAmount,
  formatCurrency,
  formatNumber,
  sqmToJerib,
} from './format';

/** Number/price/area formatting bound to the current language. */
export function useFormat() {
  const { t, i18n } = useTranslation();
  // useTranslation re-renders on language change, so this stays current.
  const language: Language = isLanguage(i18n.language)
    ? i18n.language
    : DEFAULT_LANGUAGE;
  return {
    language,
    /** "۱٬۲۰۰٬۰۰۰ ؋": the full price, with the currency's sign. */
    price: (amount: number, currency: Currency) =>
      formatCurrency(amount, currency),
    /** "۲٫۵ میلیون ؋": the short form for map markers. */
    compactPrice: (amount: number, currency: Currency) => {
      const { value, unit } = compactAmount(amount);
      const number = formatNumber(value, 1);
      const words = unit ? `${number} ${t(`unit.${unit}`)}` : number;
      return `${words} ${t(`currencySymbol.${currency}`)}`;
    },
    area: (sqm: number) => `${formatNumber(sqm)} ${t('unit.sqm')}`,
    jerib: (sqm: number) =>
      `${formatNumber(sqmToJerib(sqm))} ${t('unit.jerib')}`,
    province: (value: string) => provinceLabel(value, language),
  };
}
