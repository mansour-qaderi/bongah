import type { PushFailureCode, PushGateway, PushMessage, PushResult } from './push.gateway.js';

/**
 * Development and test gateway: nothing leaves the process. Pushes are kept in `sent`, and a test can make a
 * token fail with `failWith`. Refused in production (see readNotificationSettings).
 */
export class MockPushGateway implements PushGateway {
  readonly sent: PushMessage[] = [];
  private readonly failures = new Map<string, PushFailureCode>();
  private everyFailure: PushFailureCode | null = null;

  send(message: PushMessage): Promise<PushResult> {
    const code = this.failures.get(message.token) ?? this.everyFailure;
    if (code) return Promise.resolve({ ok: false, code, detail: `mock ${code}` });
    this.sent.push(message);
    return Promise.resolve({ ok: true });
  }

  /** Make pushes to `token` fail, or to every token when `token` is null. */
  failWith(token: string | null, code: PushFailureCode): void {
    if (token === null) this.everyFailure = code;
    else this.failures.set(token, code);
  }

  reset(): void {
    this.sent.length = 0;
    this.failures.clear();
    this.everyFailure = null;
  }
}
