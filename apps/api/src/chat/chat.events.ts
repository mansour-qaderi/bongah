import { Injectable } from '@nestjs/common';
import type { ChatMessage, ChatReadEvent } from '@bongah/shared-types';
import { Subject } from 'rxjs';

/** What the chat service tells the socket gateway. Plain data, so neither side imports the other. */
export type ChatEvent =
  | { kind: 'message'; participantIds: [string, string]; message: ChatMessage }
  | { kind: 'read'; participantIds: [string, string]; event: ChatReadEvent }
  /** Close every live connection of this person (they were banned). */
  | { kind: 'disconnect'; userId: string };

/**
 * An in-process event bus between ChatService (which writes) and ChatGateway (which pushes to
 * connected phones). Messages sent over REST reach sockets the same way as ones sent over a socket.
 * In-process means one server instance: with several, replace this with Redis pub/sub
 * (and the socket.io Redis adapter) and nothing else changes.
 */
@Injectable()
export class ChatEventsBus {
  private readonly subject = new Subject<ChatEvent>();
  readonly events$ = this.subject.asObservable();

  publish(event: ChatEvent): void {
    this.subject.next(event);
  }
}
