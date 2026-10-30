import { cookies } from 'next/headers';
import { FALLBACK_MARKET, isMarket, type Market } from '@bongah/shared-types';
import { LANGUAGE_COOKIE, MARKET_COOKIE, toLanguage, type Language } from './config';

/** The language of this request, from the cookie the switcher sets. */
export async function getRequestLanguage(): Promise<Language> {
  return toLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
}

/**
 * The country of this request, from the cookie the detection leaves (see MARKET_COOKIE). Before the first detection there is
 * none, and the page is in the Iranian words, as the app is on a first start with no location.
 */
export async function getRequestMarket(): Promise<Market> {
  const saved = (await cookies()).get(MARKET_COOKIE)?.value;
  return isMarket(saved) ? saved : FALLBACK_MARKET;
}
