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

/** The title of the push that tells a person the team answered their feedback; the answer itself is the body. */
export const FEEDBACK_REPLY_TITLE: Record<Language, string> = {
  prs: 'پاسخ بنگاه به پیام شما',
  ps: 'ستاسو پیغام ته د بنګاه ځواب',
};

/** What a feedback-reply push is tagged with, so the app can open the feedback sheet from it later. */
export const FEEDBACK_REPLY_PUSH_TYPE = 'FEEDBACK_REPLY';

/** A reply push that has not arrived within this long is dropped: the answer is saved and shown in the app anyway. */
export const FEEDBACK_REPLY_TTL_SECONDS = 24 * 60 * 60;
