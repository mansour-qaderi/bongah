import i18next, { type TFunction } from 'i18next';
import type { DealType, Market, PriceTerms } from '@bongah/shared-types';

/**
 * The name of a deal in the person's language, in the market's own words: گروی in Afghanistan is رهن کامل in Iran,
 * a sale is "فروشی" there and "خرید و فروش" here, and a rent is "کرایه" there and "اجاره" here. The value stored is the
 * same either way; only the word differs. A listing is worded for ITS market (not the viewer's), so a card never
 * reads one country's listing in the other's words.
 */
export function dealTypeLabel(
  deal: DealType,
  market: Market | undefined,
  t: TFunction,
): string {
  return market === 'IR' ? t(`dealTypeIR.${deal}`) : t(`dealType.${deal}`);
}

/** What the price field of a deal is called ("قیمت فروش", "اجارهٔ ماهانه", "مبلغ رهن", "اجارهٔ هر شب"). */
export function dealPriceLabel(
  deal: DealType,
  market: Market | undefined,
  t: TFunction,
): string {
  return market === 'IR' ? t(`dealPriceIR.${deal}`) : t(`dealPrice.${deal}`);
}

/**
 * How a price is meant ("مقطوع", "قابل توافق"). Iran says «قابل توافق» where an Afghan listing says «جورآمد (قابل توافق)»;
 * a listing is worded for ITS market, like its deal.
 */
export function priceTermsLabel(
  terms: PriceTerms | 'NONE',
  market: Market | undefined,
  t: TFunction,
): string {
  return market === 'IR' ? t(`priceTermsIR.${terms}`) : t(`priceTerms.${terms}`);
}

/**
 * A text in the words of the market it is shown in. Iran has its own wording for what Afghanistan says differently («دکان»
 * → «مغازه», «دهلیز» → «پذیرایی»…), kept beside the shared text under the same name with «IR» added: `add.hint` →
 * `add.hintIR`, and for a leaf of a group `add.titleExamples.X` → `add.titleExamplesIR.X`. In Iran the Iranian text is
 * used when there is one, and the shared text otherwise; everywhere else it is the shared text. Use it for every text
 * that can reach an Iranian eye and says something Afghan.
 */
export function marketText(
  t: TFunction,
  key: string,
  market: Market | undefined,
  options?: Record<string, unknown>,
): string {
  // The keys are built from parts, so they are plain strings here, not the checked key names of `t`.
  const say = t as unknown as (name: string, extra?: Record<string, unknown>) => string;
  if (market === 'IR') {
    const dot = key.lastIndexOf('.');
    const group = key.slice(0, dot);
    const leaf = key.slice(dot + 1);
    for (const candidate of [`${group}IR.${leaf}`, `${key}IR`]) {
      if (i18next.exists(candidate)) return say(candidate, options);
    }
  }
  return say(key, options);
}

/** The country's name ("افغانستان", "ایران"). */
export const marketName = (market: Market | undefined, t: TFunction): string =>
  t(market === 'IR' ? 'market.IR' : 'market.AF');

/**
 * The words around "where": Afghanistan has ولایت (provinces) and a district; Iran has «استان / شهر» (a province or a
 * city) and an address such as «مثلاً سعادت‌آباد، خیابان فرهنگ». Everything that names a province in a filter or a picker
 * words it through here, so an Iranian never reads «ولایت».
 */
export function placeText(
  key: 'province' | 'allProvinces' | 'selectProvince' | 'searchProvince' | 'districtPlaceholder',
  market: Market | undefined,
  t: TFunction,
): string {
  return market === 'IR' ? t(`homeIR.${key}`) : t(`home.${key}`);
}
