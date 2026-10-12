import type { Language } from '@bongah/shared-types';

/**
 * The two supported languages. Both are written right-to-left, so the layout direction never
 * changes with the language: the whole app is RTL (see rtl.ts), and switching language only
 * swaps strings. `nativeName` is always shown in its own script so a user can find their
 * language even when the UI is in the other one.
 */
export const LANGUAGE_META: Record<Language, { nativeName: string }> = {
  prs: { nativeName: 'دری' },
  ps: { nativeName: 'پښتو' },
};

export const DEFAULT_LANGUAGE: Language = 'prs';

export const isLanguage = (value: unknown): value is Language =>
  value === 'prs' || value === 'ps';
