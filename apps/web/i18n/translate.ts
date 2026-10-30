import type { Market } from '@bongah/shared-types';
import type { Language } from './config';
import { DEFAULT_LANGUAGE } from './config';
import { prs } from './messages/prs';
import { ps } from './messages/ps';

export type MessageKey = keyof typeof prs;
export type MessageParams = Record<string, string | number>;

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { prs, ps };

/**
 * One message in one language, with `{name}` placeholders filled in. A key missing from the language (which the type
 * system rules out, and a test double-checks) falls back to Dari rather than showing the raw key.
 */
export function translate(language: Language, key: MessageKey, params?: MessageParams): string {
  const raw = DICTIONARIES[language]?.[key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

export type Translator = (key: MessageKey, params?: MessageParams) => string;

export const translatorFor =
  (language: Language): Translator =>
  (key, params) =>
    translate(language, key, params);

/**
 * The key to use for a text in a market. Iran has its own wording for what Afghanistan says differently («مغازه» for
 * «دکان», «استان» for «ولایت», «منطقه» for «ناحیه»…), kept beside the shared text under the same key with «IR» added:
 * `form.districtPlaceholder` → `form.districtPlaceholderIR`. In Iran the Iranian text is used when there is one, the
 * shared text otherwise; everywhere else it is the shared text. Use it for every text that can reach an Iranian eye and
 * says something Afghan.
 */
export function marketKey(key: MessageKey, market: Market | undefined): MessageKey {
  if (market !== 'IR') return key;
  const sibling = `${key}IR`;
  return sibling in prs ? (sibling as MessageKey) : key;
}

/** `translate`, worded for a market (see `marketKey`). */
export const translateFor = (language: Language, key: MessageKey, market: Market | undefined, params?: MessageParams): string =>
  translate(language, marketKey(key, market), params);
