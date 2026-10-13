import type { ChatMessage } from '@bongah/shared-types';
import type { Message as MessageRow } from '../generated/prisma/client.js';

/** API path a picture is downloaded from (authenticated; the app sends its token). */
export function chatImagePath(imageId: string): string {
  return `/chat/images/${imageId}`;
}

export function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversation_id: row.conversationId,
    sender_id: row.senderId,
    type: row.type,
    body: row.body,
    image_url: row.imageId ? chatImagePath(row.imageId) : null,
    lat: row.lat,
    lng: row.lng,
    is_auto_reply: row.isAutoReply,
    client_id: row.clientId,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** An opaque "older than this message" bookmark: its time and id (the order history is sorted by). */
export function encodeCursor(row: Pick<MessageRow, 'createdAt' | 'id'>): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const [iso, id, extra] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (extra !== undefined || Number.isNaN(createdAt.getTime()) || !id || !uuid.test(id)) return null;
  return { createdAt, id };
}
