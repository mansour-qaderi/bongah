import type { ApiErrorBody } from '@bongah/shared-types';
import { tNow } from '@/i18n/active';

/** Every call from the page goes to the panel's own server, which adds the token and forwards to the API. */
const BASE = '/api/bongah';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: ApiErrorBody;
  readonly retryAfter?: number;

  constructor(status: number, body: ApiErrorBody, retryAfter?: number) {
    super(body.message || messageForStatus(status));
    this.status = status;
    this.code = body.code;
    this.body = body;
    this.retryAfter = retryAfter ?? body.retry_after;
  }
}

function messageForStatus(status: number): string {
  if (status === 401) return tNow('err.401');
  if (status === 403) return tNow('err.403');
  if (status === 404) return tNow('err.404');
  if (status === 429) return tNow('err.429');
  if (status >= 500) return tNow('err.5xx');
  return tNow('err.default');
}

/** The API's messages are in English; the codes it attaches to business-rule errors get wording here, in the language shown. */
const KNOWN_CODES = [
  'PERKS_REQUIRED',
  'SUBSCRIPTION_REQUIRED',
  'AGENCY_PROFILE_REQUIRED',
  'AGENCY_LISTING_LIMIT_REACHED',
  'TRIAL_LISTING_LIMIT_REACHED',
  'FREE_LISTING_LIMIT_REACHED',
  'NOT_ENOUGH_LADDERS',
  'NO_FEATURED_CREDITS',
  'PROPERTY_NOT_ACTIVE',
  'LISTING_REMOVED',
  'VALIDATION_FAILED',
  'VALIDATION_ERROR',
  'IMAGE_TOO_LARGE',
  'UNSUPPORTED_IMAGE_TYPE',
  'EMPTY_IMAGE',
  'PAYMENT_NOT_PENDING',
  'RECEIPT_IMAGE_MISSING',
  'REFERENCE_ALREADY_USED',
  'NOT_A_MANUAL_PAYMENT',
  'CROSS_SITE_REQUEST',
  'PAYLOAD_TOO_LARGE',
  'DATABASE_UNAVAILABLE',
  'API_UNREACHABLE',
  'API_BAD_RESPONSE',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'MARKET_MISMATCH',
  'MARKET_PAYMENTS_UNAVAILABLE',
] as const;

/** The wording for an API error code in the language shown now, when there is one. */
export function messageForCode(code: string | undefined): string | undefined {
  if (!code || !(KNOWN_CODES as readonly string[]).includes(code)) return undefined;
  return tNow(`err.code.${code as (typeof KNOWN_CODES)[number]}`);
}

/** A readable message, in the language shown, for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const known = messageForCode(error.code);
    if (known) return known;
    const first = error.body.errors?.[0];
    if (first && error.status === 400) return `${error.message} (${first.field}: ${first.message})`;
    return error.message;
  }
  if (error instanceof TypeError) return tNow('err.network');
  return error instanceof Error && error.message ? error.message : tNow('err.unknown');
}

let signingOut = false;

async function toError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* not JSON (a gateway page, say) */
  }
  const retry = Number(res.headers.get('retry-after'));
  if (res.status === 401 && typeof window !== 'undefined' && !signingOut) {
    // The proxy has already cleared the cookie; go to the login page and come back here afterwards.
    signingOut = true;
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?next=${next}`);
  }
  return new ApiError(res.status, body, Number.isFinite(retry) && retry > 0 ? retry : undefined);
}

export interface RequestOptions {
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function url(path: string, query?: RequestOptions['query']): string {
  const clean = path.replace(/^\/+/, '');
  if (!query) return `${BASE}/${clean}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${BASE}/${clean}?${qs}` : `${BASE}/${clean}`;
}

async function send<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(url(path, options.query), {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
    cache: 'no-store',
  });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Uploads a file as the raw request body (how the API takes photos). */
async function upload<T>(path: string, file: File): Promise<T> {
  const res = await fetch(url(path), { method: 'POST', headers: { 'content-type': file.type }, body: file, cache: 'no-store' });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

export const api = {
  upload,
  get: <T>(path: string, options?: RequestOptions) => send<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => send<T>('POST', path, body ?? {}, options),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) => send<T>('PATCH', path, body, options),
  put: <T>(path: string, body: unknown, options?: RequestOptions) => send<T>('PUT', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => send<T>('DELETE', path, undefined, options),
};

/** The auth routes live on the panel itself, not behind the proxy. */
export async function authPost<T>(path: 'send-otp' | 'verify-otp' | 'logout', body?: unknown): Promise<T> {
  const res = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  });
  if (!res.ok) {
    let parsed: ApiErrorBody = {};
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      /* ignore */
    }
    const retry = Number(res.headers.get('retry-after'));
    throw new ApiError(res.status, parsed, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  return (await res.json()) as T;
}

/** SWR fetcher: the key is the API path with its query string. */
export const fetcher = <T,>(key: string): Promise<T> => api.get<T>(key);
