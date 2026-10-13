import { z } from 'zod';
import { CHAT_MESSAGE_MAX_LENGTH, CHAT_TEMPLATE_MAX_LENGTH } from '@bongah/shared-types';

/** Message text: line endings unified and the ends trimmed, but the inside is left alone (people use line breaks). */
const messageText = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\r\n?/g, '\n').trim())
    .pipe(z.string().min(1, 'Empty message').max(max, `At most ${max} characters`));

/** A caption / note on a picture or a pin: optional, and blank counts as none. */
const optionalNote = z
  .string()
  .max(CHAT_MESSAGE_MAX_LENGTH * 2)
  .optional()
  .transform((value, ctx) => {
    const text = value?.replace(/\r\n?/g, '\n').trim() ?? '';
    if (text === '') return undefined;
    if (text.length > CHAT_MESSAGE_MAX_LENGTH) {
      ctx.addIssue({ code: 'custom', message: `At most ${CHAT_MESSAGE_MAX_LENGTH} characters` });
      return z.NEVER;
    }
    return text;
  });

/**
 * One chat message to send. `client_id` is made by the sender's device: sending the same
 * message again (a retry after a dropped connection) stores it once.
 */
export const sendMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('TEXT'),
    client_id: z.uuid(),
    body: messageText(CHAT_MESSAGE_MAX_LENGTH),
  }),
  z.strictObject({
    type: z.literal('IMAGE'),
    client_id: z.uuid(),
    image_id: z.uuid(),
    body: optionalNote,
  }),
  z.strictObject({
    type: z.literal('LOCATION'),
    client_id: z.uuid(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    body: optionalNote,
  }),
]);
export type SendMessageInput = z.output<typeof sendMessageSchema>;

/** POST /chat/conversations: open (or reopen) the chat about a listing. */
export const startConversationSchema = z.strictObject({ property_id: z.uuid() });
export type StartConversationInput = z.output<typeof startConversationSchema>;

/** The socket `message:send` payload. */
export const socketSendMessageSchema = z.strictObject({
  conversation_id: z.uuid(),
  message: sendMessageSchema,
});
export type SocketSendMessageInput = z.output<typeof socketSendMessageSchema>;

/** The socket `typing` payload. */
export const typingSchema = z.strictObject({
  conversation_id: z.uuid(),
  is_typing: z.boolean(),
});
export type TypingInput = z.output<typeof typingSchema>;

/** The socket `message:read` payload. */
export const readConversationSchema = z.strictObject({ conversation_id: z.uuid() });
export type ReadConversationInput = z.output<typeof readConversationSchema>;

export const CHAT_HISTORY_DEFAULT_LIMIT = 30;
export const CHAT_HISTORY_MAX_LIMIT = 50;

/** GET /chat/conversations/:id/messages. `before` is the `next_cursor` of the previous page. */
export const messageHistoryQuerySchema = z.strictObject({
  before: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,200}$/, 'Invalid cursor')
    .optional(),
  limit: z.coerce.number().int().min(1).max(CHAT_HISTORY_MAX_LIMIT).default(CHAT_HISTORY_DEFAULT_LIMIT),
});
export type MessageHistoryQuery = z.output<typeof messageHistoryQuerySchema>;

const templateBody = messageText(CHAT_TEMPLATE_MAX_LENGTH);

/** POST /chat/templates. */
export const createTemplateSchema = z.strictObject({
  body: templateBody,
  is_auto_reply: z.boolean().default(false),
});
export type CreateTemplateInput = z.output<typeof createTemplateSchema>;

/** PATCH /chat/templates/:id. */
export const updateTemplateSchema = z
  .strictObject({
    body: templateBody.optional(),
    is_auto_reply: z.boolean().optional(),
  })
  .refine((value) => value.body !== undefined || value.is_auto_reply !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateTemplateInput = z.output<typeof updateTemplateSchema>;
