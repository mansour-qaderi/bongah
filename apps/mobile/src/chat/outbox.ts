import type { ChatMessage, MessageType } from '@bongah/shared-types';
import type { SendMessageInput } from '@bongah/validation';

/**
 * A message this phone is sending (or failed to send). It is shown in the chat straight away and
 * disappears when the server's copy arrives. `clientId` is also the key that makes a retry safe.
 */
export interface Outgoing {
  clientId: string;
  type: MessageType;
  body: string | null;
  lat: number | null;
  lng: number | null;
  /** IMAGE: the picture on this phone, until it is uploaded. */
  localUri: string | null;
  contentType: string | null;
  /** IMAGE: set once the upload worked, so a retry only repeats the send. */
  imageId: string | null;
  status: 'sending' | 'failed';
  error: unknown;
  createdAt: string;
}

export const textOutgoing = (clientId: string, body: string): Outgoing => ({
  clientId,
  type: 'TEXT',
  body,
  lat: null,
  lng: null,
  localUri: null,
  contentType: null,
  imageId: null,
  status: 'sending',
  error: null,
  createdAt: new Date().toISOString(),
});

export const imageOutgoing = (
  clientId: string,
  localUri: string,
  contentType: string,
): Outgoing => ({
  ...textOutgoing(clientId, ''),
  type: 'IMAGE',
  body: null,
  localUri,
  contentType,
});

export const locationOutgoing = (
  clientId: string,
  lat: number,
  lng: number,
): Outgoing => ({
  ...textOutgoing(clientId, ''),
  type: 'LOCATION',
  body: null,
  lat,
  lng,
});

/** What to send for this message; an IMAGE needs its upload id first. */
export function toSendInput(
  out: Outgoing,
  imageId: string | null,
): SendMessageInput {
  switch (out.type) {
    case 'IMAGE':
      if (!imageId) throw new Error('The picture has not been uploaded yet');
      return {
        type: 'IMAGE',
        client_id: out.clientId,
        image_id: imageId,
        body: undefined,
      };
    case 'LOCATION':
      return {
        type: 'LOCATION',
        client_id: out.clientId,
        lat: out.lat as number,
        lng: out.lng as number,
        body: undefined,
      };
    default:
      return { type: 'TEXT', client_id: out.clientId, body: out.body ?? '' };
  }
}

/** One row of the chat: the server's message, or one still on its way. */
export type ChatItem =
  | { kind: 'sent'; key: string; message: ChatMessage }
  | { kind: 'outgoing'; key: string; out: Outgoing };

/**
 * The rows to draw, newest first: my unsent messages on top of the server's history. An unsent
 * message whose server copy has already arrived (the socket echo beat the send's own answer) is
 * dropped, so nothing shows twice.
 */
export function chatItems(
  history: ChatMessage[],
  outbox: Outgoing[],
  myId: string | undefined,
): ChatItem[] {
  const arrived = new Set(
    history.filter(m => m.sender_id === myId).map(m => m.client_id),
  );
  const pending: ChatItem[] = outbox
    .filter(out => !arrived.has(out.clientId))
    .map(
      (out): ChatItem => ({
        kind: 'outgoing',
        key: `out-${out.clientId}`,
        out,
      }),
    )
    .reverse();
  return [
    ...pending,
    ...history.map(
      (message): ChatItem => ({ kind: 'sent', key: message.id, message }),
    ),
  ];
}
