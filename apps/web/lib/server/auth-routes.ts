import { cookies, headers } from 'next/headers';
import { forwardedFor } from './client-ip';
import { panelOrigin } from './env';
import { isSameOriginWrite } from './same-origin';
import { callUpstream, MAX_BODY_BYTES, UpstreamUnreachable, unreachableResponse } from './upstream';
import { clearedSessionCookie, sessionCookie } from './session-cookie';

export const forbiddenResponse = () =>
  Response.json({ message: 'این درخواست از خود پنل ارسال نشده است.', code: 'CROSS_SITE_REQUEST' }, { status: 403 });

/** Passes a JSON body through to a public /auth/* route and returns the API's answer untouched. */
type Relay = { forbidden: true } | { response: Response } | { upstream: Response };

async function relayAuth(request: Request, path: 'auth/send-otp' | 'auth/verify-otp'): Promise<Relay> {
  const h = await headers();
  if (!isSameOriginWrite(h, panelOrigin())) return { forbidden: true as const };
  const text = await request.text();
  if (text.length > 10_000) {
    return { response: Response.json({ message: 'درخواست نامعتبر است.', code: 'VALIDATION_ERROR' }, { status: 400 }) };
  }
  try {
    const upstream = await callUpstream({
      method: 'POST',
      path,
      body: text,
      contentType: 'application/json',
      forwardedFor: forwardedFor(h),
    });
    return { upstream };
  } catch (error) {
    if (error instanceof UpstreamUnreachable) return { response: unreachableResponse() };
    throw error;
  }
}

export async function sendOtp(request: Request): Promise<Response> {
  const result = await relayAuth(request, 'auth/send-otp');
  if ('forbidden' in result) return forbiddenResponse();
  if ('response' in result) return result.response;
  const { upstream } = result;
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(upstream.headers.get('retry-after') ? { 'retry-after': upstream.headers.get('retry-after')! } : {}),
    },
  });
}

/** Signs in: the access token goes into the httpOnly cookie and never to the page. */
export async function verifyOtp(request: Request): Promise<Response> {
  const result = await relayAuth(request, 'auth/verify-otp');
  if ('forbidden' in result) return forbiddenResponse();
  if ('response' in result) return result.response;
  const { upstream } = result;
  const body = await upstream.text();
  const retryAfter = upstream.headers.get('retry-after');
  const passthrough = {
    'content-type': 'application/json; charset=utf-8',
    ...(retryAfter ? { 'retry-after': retryAfter } : {}),
  };
  if (!upstream.ok) return new Response(body, { status: upstream.status, headers: passthrough });

  let parsed: { access_token?: unknown; expires_in?: unknown; [key: string]: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return Response.json({ message: 'پاسخ سرور نامعتبر بود.', code: 'API_BAD_RESPONSE' }, { status: 502 });
  }
  const { access_token: token, expires_in: expiresIn, ...rest } = parsed;
  if (typeof token !== 'string' || typeof expiresIn !== 'number') {
    return Response.json({ message: 'پاسخ سرور نامعتبر بود.', code: 'API_BAD_RESPONSE' }, { status: 502 });
  }
  (await cookies()).set({ ...sessionCookie(Math.max(60, Math.floor(expiresIn))), value: token });
  return Response.json({ ...rest, expires_in: expiresIn }, { headers: { 'cache-control': 'no-store' } });
}

export async function logout(): Promise<Response> {
  const h = await headers();
  if (!isSameOriginWrite(h, panelOrigin())) return forbiddenResponse();
  (await cookies()).set(clearedSessionCookie());
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}

export { MAX_BODY_BYTES };
