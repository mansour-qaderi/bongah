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
