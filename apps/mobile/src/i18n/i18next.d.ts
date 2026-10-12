import 'i18next';
import type prs from './locales/prs.json';

// Makes t('some.key') a compile-time check against the Dari file, so a typo'd or deleted key
// fails `tsc` instead of showing the raw key on a user's screen. (Dari/Pashto key parity is
// checked by the unit test.)
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof prs };
  }
}
