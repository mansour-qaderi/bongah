/**
 * A stand-in for socket.io-client. The chat code talks to it exactly as it would a real socket;
 * a test drives the "server" side with the helpers below (`serverEmit`, `connect`, `acks`).
 */
type Handler = (...args: unknown[]) => void;

export class MockSocket {
  connected = false;
  handlers = new Map<string, Set<Handler>>();
  /** Everything the app emitted: [event, payload]. */
  emitted: [string, unknown][] = [];
  /** Answers for emitWithAck by event name. A function receives the payload. */
  acks: Record<string, unknown | ((payload: unknown) => unknown)> = {};
  options: Record<string, unknown>;

  constructor(
    readonly url: string,
    options: Record<string, unknown> = {},
  ) {
    this.options = options;
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }
  off(event: string, handler?: Handler) {
    if (handler) this.handlers.get(event)?.delete(handler);
    else this.handlers.delete(event);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push([event, payload]);
    return this;
  }
  timeout() {
    return {
      emitWithAck: async (event: string, payload: unknown) => {
        this.emitted.push([event, payload]);
        if (!this.connected) throw new Error('socket has been disconnected');
        const answer = this.acks[event];
        if (answer === 'timeout') throw new Error('operation has timed out');
        return typeof answer === 'function' ? answer(payload) : answer;
      },
    };
  }
  disconnect() {
    this.connected = false;
    this.fire('disconnect', 'io client disconnect');
    return this;
  }
  close = this.disconnect;

  // ── test side ──
  fire(event: string, ...args: unknown[]) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
  }
  /** The server accepted the connection. */
  connect() {
    this.connected = true;
    this.fire('connect');
  }
  /** The server sent an event. */
  serverEmit(event: string, payload?: unknown) {
    this.fire(event, payload);
  }
  sent(event: string) {
    return this.emitted.filter(([name]) => name === event).map(([, payload]) => payload);
  }
}

export const sockets: MockSocket[] = [];
export const lastSocket = () => sockets[sockets.length - 1];
export const resetSockets = () => {
  sockets.length = 0;
};

export const io = (url: string, options?: Record<string, unknown>) => {
  const socket = new MockSocket(url, options);
  sockets.push(socket);
  return socket;
};
