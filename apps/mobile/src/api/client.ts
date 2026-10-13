import type { ApiErrorBody } from '@bongah/shared-types';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../config';

/**
 * Anything that goes wrong talking to the API. `kind` separates "never reached the server"
 * (network, timeout) from "the server said no" (http); screens turn it into a message with
 * errorMessage() — they should not show `body.message`, which is English and for developers.
 */
export class ApiError extends Error {
  constructor(
    readonly kind: 'network' | 'timeout' | 'http',
    readonly status: number,
    readonly body: ApiErrorBody = {},
  ) {
    super(body.message ?? kind);
    this.name = 'ApiError';
  }

  get code(): string | undefined {
    return this.body.code;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Set by AuthProvider: the token sent with `auth: true` requests. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** The token of the signed-in session, for things that cannot go through request() (the chat socket, picture downloads). */
export function getAuthToken(): string | null {
  return authToken;
}

/** Set by AuthProvider: called when a signed-in request is answered with 401 (token expired/revoked). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** The file itself as the request body (picture uploads), sent with this Content-Type instead of JSON. */
  file?: { data: Blob; contentType: string };
  /** Overrides REQUEST_TIMEOUT_MS (uploads on slow networks need longer). */
  timeoutMs?: number;
  /** Send the bearer token. A 401 then means "your session is over", not "wrong input". */
  auth?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }
  return `${API_BASE_URL}${path}${parts.length ? `?${parts.join('&')}` : ''}`;
}

async function readBody(response: Response): Promise<ApiErrorBody | unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined; // an HTML error page from a proxy, say
  }
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.file) headers['Content-Type'] = options.file.contentType;
  else if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const sentToken = options.auth ? authToken : null;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? REQUEST_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.file
        ? options.file.data
        : options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error && error.name === 'AbortError'
        ? 'timeout'
        : 'network',
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await readBody(response);

  if (!response.ok) {
    const body: ApiErrorBody =
      data && typeof data === 'object' ? { ...(data as ApiErrorBody) } : {};
    const headerRetry = Number(response.headers.get('retry-after'));
    if (
      body.retry_after === undefined &&
      Number.isFinite(headerRetry) &&
      headerRetry > 0
    ) {
      body.retry_after = headerRetry;
    }
    // Only a request that carried a token can mean "session over". A 401 on verify-otp is a wrong code.
    if (response.status === 401 && sentToken && sentToken === authToken)
      onUnauthorized?.();
    throw new ApiError('http', response.status, body);
  }

  return data as T;
}
