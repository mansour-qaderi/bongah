import type { Language } from './config';
import { DEFAULT_LANGUAGE } from './config';
import type { Market } from '@bongah/shared-types';
import { translateFor, translatorFor, type MessageKey, type MessageParams, type Translator } from './translate';

/**
 * The language the signed-in browser tab is showing, for code that has no React hook: toasts, API error wording,
 * number and date formatting of data. It is only ever set in the browser (by LanguageProvider), and the provider
 * remounts the whole page when it changes, so everything built from it is rebuilt.
 *
 * It is deliberately NOT set on the server. One server process renders many people's requests, so a module-level
 * variable there would leak one person's language into another's. Words that appear in the first (server) render
 * therefore always come from the `useT()` hook, which reads the request's own language from context.
 */
let active: Language = DEFAULT_LANGUAGE;

export function setActiveLanguage(language: Language): void {
  if (typeof window !== 'undefined') active = language;
}

export const activeLanguage = (): Language => active;

/** For event handlers, toasts and error text (never for words rendered on the server). */
export const tNow: Translator = (key, params) => translatorFor(active)(key, params);

/** `tNow`, worded for a market (Iran has its own words for some texts; see `marketKey`). */
export const tNowFor = (key: MessageKey, market: Market | undefined, params?: MessageParams): string => translateFor(active, key, market, params);
