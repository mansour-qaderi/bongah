import { apiBase } from './env';

/** Longest the panel waits for the API. */
export const UPSTREAM_TIMEOUT_MS = 30_000;

/** Largest request body the panel passes on (the API's own limit for a high-resolution photo is 15 MB). */
export const MAX_BODY_BYTES = 16 * 1024 * 1024;

export class UpstreamUnreachable extends Error {}

/**
 * Path segments that must never be sent on: they would let a request climb out of the path it names.
 * (Next has already decoded the percent-escapes, so `%2e%2e` arrives here as "..".)
 */
function isUnsafeSegment(segment: string): boolean {
  return segment === '' || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\') || segment.includes('\0');
}

/** What the panel will not carry to the API: signing in is done by its own routes, the payment webhook is HesabPay's. */
const BLOCKED_FIRST_SEGMENTS = new Set(['auth']);
const BLOCKED_PATHS = new Set(['hesabpay/webhook']);

/** The API path for the segments of /api/bongah/..., or null when the panel should refuse the request. */
export function upstreamPath(segments: string[]): string | null {
  if (segments.length === 0 || segments.some(isUnsafeSegment)) return null;
  if (BLOCKED_FIRST_SEGMENTS.has(segments[0]!)) return null;
  const joined = segments.join('/');
  if (BLOCKED_PATHS.has(joined)) return null;
  return segments.map(encodeURIComponent).join('/');
}

export interface UpstreamRequest {
  method: string;
  /** From upstreamPath(), or a fixed path such as "auth/send-otp". */
  path: string;
  search?: string;
  token?: string;
  body?: BodyInit | null;
  contentType?: string | null;
  /** The client's address chain, so the API's per-address limits count the real person (see TRUST_PROXY in the API). */
  forwardedFor?: string | null;
}

export async function callUpstream(request: UpstreamRequest): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (request.token) headers.authorization = `Bearer ${request.token}`;
  if (request.contentType) headers['content-type'] = request.contentType;
  if (request.forwardedFor) headers['x-forwarded-for'] = request.forwardedFor;
  try {
    return await fetch(`${apiBase()}/${request.path}${request.search ?? ''}`, {
      method: request.method,
      headers,
      body: request.body ?? undefined,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    throw new UpstreamUnreachable(error instanceof Error ? error.message : String(error));
  }
}

export const unreachableResponse = () =>
  Response.json({ message: 'سرور بنگاه در دسترس نیست. کمی بعد دوباره تلاش کنید.', code: 'API_UNREACHABLE' }, { status: 502 });
