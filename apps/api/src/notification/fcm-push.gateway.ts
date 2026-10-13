import { createSign } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { FcmCredentials } from './notification.config.js';
import type { PushGateway, PushMessage, PushResult } from './push.gateway.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const REQUEST_TIMEOUT_MS = 10_000;

type FetchFn = typeof fetch;

interface CachedToken {
  value: string;
  /** Epoch ms after which a new one is needed (a minute before Google's own expiry). */
  expiresAt: number;
}

/**
 * Sends through Firebase Cloud Messaging's HTTP v1 API, with no Firebase SDK: a service-account key is
 * exchanged for a short-lived access token (a signed JWT posted to Google), and each push is one POST.
 *
 * NOT verified against Google's servers: there are no credentials where this was written. The request
 * shape follows the FCM v1 reference and is covered by tests against a fake `fetch`; use
 * POST /admin/notifications/test with real credentials to confirm it end to end.
 */
export class FcmPushGateway implements PushGateway {
  private readonly logger = new Logger(FcmPushGateway.name);
  private cached: CachedToken | null = null;
  private refreshing: Promise<CachedToken | FailedPush> | null = null;

  constructor(
    private readonly credentials: FcmCredentials,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async send(message: PushMessage): Promise<PushResult> {
    // One retry, only when Google says our access token was refused (it can expire early or be revoked).
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken();
      if ('code' in token) return token;

      const result = await this.post(message, token.value);
      if (result.status === 401 && attempt === 0) {
        this.cached = null;
        continue;
      }
      return result.result;
    }
    return { ok: false, code: 'AUTH', detail: 'FCM kept refusing the access token.' };
  }

  // ───────────── access token ─────────────

  private accessToken(): Promise<CachedToken | FailedPush> {
    if (this.cached && this.cached.expiresAt > this.now()) return Promise.resolve(this.cached);
    // Many sends start together: share one token request instead of making one each.
    this.refreshing ??= this.fetchAccessToken().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async fetchAccessToken(): Promise<CachedToken | FailedPush> {
    const issuedAt = Math.floor(this.now() / 1000);
    const assertion = signJwt(this.credentials, issuedAt);
    let response: Response;
    try {
      response = await this.fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      return failure('TRANSIENT', `token request failed: ${describe(error)}`);
    }
    const body = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown; error?: unknown } | null;
    if (!response.ok || typeof body?.access_token !== 'string') {
      // 4xx from the token endpoint means the key itself is wrong or revoked; 5xx is Google having a bad moment.
      const code = response.status >= 500 || response.status === 429 ? 'TRANSIENT' : 'AUTH';
      this.logger.error(`FCM token request answered ${response.status} ${typeof body?.error === 'string' ? body.error : ''}`.trim());
      return failure(code, `token request answered ${response.status}`);
    }
    const lifetime = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    this.cached = { value: body.access_token, expiresAt: this.now() + Math.max(60, lifetime - 60) * 1000 };
    return this.cached;
  }

  // ───────────── sending ─────────────

  private async post(message: PushMessage, accessToken: string): Promise<{ status: number; result: PushResult }> {
    let response: Response;
    try {
      response = await this.fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.credentials.projectId)}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(buildBody(message, this.now())),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      return { status: 0, result: failure('TRANSIENT', `request failed: ${describe(error)}`) };
    }
    if (response.ok) return { status: response.status, result: { ok: true } };

    const body = (await response.json().catch(() => null)) as FcmErrorBody | null;
    return { status: response.status, result: classify(response.status, body) };
  }
}

interface FcmErrorBody {
  error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> };
}

/** The FCM v1 message: a visible notification plus data, with a lifetime so a late push is dropped, not delivered at noon. */
export function buildBody(message: PushMessage, nowMs: number): { message: Record<string, unknown> } {
  return {
    message: {
      token: message.token,
      notification: { title: message.title, body: message.body },
      ...(message.data ? { data: message.data } : {}),
      android: { priority: 'NORMAL', ttl: `${message.ttlSeconds}s` },
      apns: {
        headers: {
          'apns-priority': '5',
          'apns-expiration': String(Math.floor(nowMs / 1000) + message.ttlSeconds),
        },
        payload: { aps: { sound: 'default' } },
      },
    },
  };
}

/** Turns an FCM error answer into what the sender should do about it. */
export function classify(status: number, body: FcmErrorBody | null): PushResult {
  const errorCode = body?.error?.details?.find((detail) => typeof detail.errorCode === 'string')?.errorCode;
  const detail = `${status} ${errorCode ?? body?.error?.status ?? ''} ${body?.error?.message ?? ''}`.trim();

  if (errorCode === 'UNREGISTERED') return failure('UNREGISTERED', detail);
  // SENDER_ID_MISMATCH: the token belongs to another Firebase project. Unusable for us, but not proof that it is dead,
  // so it is refused (INVALID) rather than forgotten. It also arrives as a 403, which would otherwise read as bad credentials.
  if (errorCode === 'SENDER_ID_MISMATCH' || errorCode === 'INVALID_ARGUMENT') return failure('INVALID', detail);
  if (status === 400) return failure('INVALID', detail);
  if (status === 401 || status === 403) return failure('AUTH', detail);
  if (status === 429 || status >= 500) return failure('TRANSIENT', detail);
  return failure('INVALID', detail);
}

type FailedPush = Extract<PushResult, { ok: false }>;

function failure(code: FailedPush['code'], detail: string): FailedPush {
  return { ok: false, code, detail };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** The signed request for an access token (RFC 7523): RS256 over header.claims with the service-account key. */
export function signJwt(credentials: FcmCredentials, issuedAtSeconds: number): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issuedAtSeconds,
      exp: issuedAtSeconds + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(credentials.privateKey);
  return `${header}.${claims}.${base64Url(signature)}`;
}
