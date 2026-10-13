import type { Language } from '@bongah/shared-types';

/**
 * The fixed words around a quote. The quote itself comes from the admin's templates.
 * (Pashto wording was written without a native speaker: have one read it before launch.)
 */
export const MORNING_TITLE: Record<Language, string> = {
  prs: 'صبح بخیر',
  ps: 'سهار مو په خیر',
};

/** Only used by the admin "send me a test push" button when no morning quote exists yet. */
export const TEST_BODY: Record<Language, string> = {
  prs: 'این یک پیام آزمایشی از بنگاه است.',
  ps: 'دا د بنګاه یو آزموینیز پیغام دی.',
};

/** What a morning push is tagged with, so the app can tell it apart from other pushes later. */
export const MORNING_PUSH_TYPE = 'MORNING_QUOTE';

/** A morning push that has not arrived within this long is dropped: "good morning" at 3 pm helps nobody. */
export const MORNING_PUSH_TTL_SECONDS = 3 * 60 * 60;
