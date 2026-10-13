import type { TFunction } from 'i18next';
import type { ChatMessage } from '@bongah/shared-types';

/** The one-line summary of a message, for the conversation list. */
export function messagePreview(
  message: ChatMessage,
  myId: string | undefined,
  t: TFunction,
): string {
  const what =
    message.type === 'IMAGE'
      ? t('chat.photo')
      : message.type === 'LOCATION'
      ? t('chat.location')
      : message.body ?? '';
  return message.sender_id === myId ? `${t('chat.you')} ${what}` : what;
}
