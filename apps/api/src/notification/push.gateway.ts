export const PUSH_GATEWAY = Symbol('PUSH_GATEWAY');

export interface PushMessage {
  /** The device's FCM registration token. */
  token: string;
  title: string;
  body: string;
  /** Extra key/values the app can read. Values must be strings (an FCM rule). */
  data?: Record<string, string>;
  /** After this long an undelivered push is dropped instead of arriving hours late. */
  ttlSeconds: number;
}

/**
 * Why a push failed, in the terms the sender acts on:
 *  - UNREGISTERED: the app was uninstalled or the token expired. Forget the token.
 *  - INVALID: the provider refused this one message or token. Do not retry it.
 *  - AUTH: our credentials or configuration are wrong, so EVERY push would fail. Stop the run.
 *  - TRANSIENT: the provider or the network failed. Trying again later may work.
 */
export type PushFailureCode = 'UNREGISTERED' | 'INVALID' | 'AUTH' | 'TRANSIENT';

export type PushResult = { ok: true } | { ok: false; code: PushFailureCode; detail: string };

export interface PushGateway {
  /** Never throws: every failure is a result. */
  send(message: PushMessage): Promise<PushResult>;
}

/** Used when PUSH_PROVIDER=off. The morning run and the test push check the setting first, so this is a backstop. */
export class DisabledPushGateway implements PushGateway {
  send(): Promise<PushResult> {
    return Promise.resolve({ ok: false, code: 'AUTH', detail: 'Push notifications are switched off (PUSH_PROVIDER=off).' });
  }
}
