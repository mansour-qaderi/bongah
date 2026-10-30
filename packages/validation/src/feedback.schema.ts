import { z } from 'zod';
import { FEEDBACK_CATEGORIES, FEEDBACK_MAX_LENGTH, FEEDBACK_MIN_LENGTH } from '@bongah/shared-types';

/** POST /feedback: a suggestion, a problem or a thank-you for the Bongah team, from the Account tab. */
export const createFeedbackSchema = z.strictObject({
  category: z.enum(FEEDBACK_CATEGORIES),
  /** Line breaks are kept (people write paragraphs): runs of spaces are squeezed and three or more line breaks become one blank line. */
  message: z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(
      z
        .string()
        .min(FEEDBACK_MIN_LENGTH, `At least ${FEEDBACK_MIN_LENGTH} characters`)
        .max(FEEDBACK_MAX_LENGTH, `At most ${FEEDBACK_MAX_LENGTH} characters`),
    ),
  /** Optional app version, so a problem report says which build it came from. */
  app_version: z.string().trim().max(32).optional(),
});
export type CreateFeedbackInput = z.output<typeof createFeedbackSchema>;

/** POST /admin/feedback/:id/reply: what the team writes back to the person. Same tidy-up as the message itself. */
export const adminFeedbackReplySchema = z.strictObject({
  message: z
    .string()
    .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
    .pipe(z.string().min(2, 'At least 2 characters').max(FEEDBACK_MAX_LENGTH, `At most ${FEEDBACK_MAX_LENGTH} characters`)),
});
export type AdminFeedbackReplyInput = z.output<typeof adminFeedbackReplySchema>;
