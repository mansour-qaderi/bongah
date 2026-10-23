import { cookies, headers } from 'next/headers';
import { forwardedFor } from './client-ip';
import { panelOrigin } from './env';
import { isSafeMethod, isSameOriginWrite } from './same-origin';
import { clearedSessionCookie, SESSION_COOKIE } from './session-cookie';
import { callUpstream, MAX_BODY_BYTES, UpstreamUnreachable, unreachableResponse, upstreamPath } from './upstream';

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'retry-after', 'content-disposition'] as const;

/**
 * The panel's only door to the API for the signed-in pages. It adds the token from the httpOnly cookie, so scripts in
 * the page never hold it, and it only opens onto the API routes the panel needs (not sign-in, not the payment webhook).
 */
export async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  const target = upstreamPath(path);
  if (target === null) {
    return Response.json({ message: 'این مسیر در دسترس نیست.', code: 'NOT_FOUND' }, { status: 404 });
  }
  const h = await headers();
  if (!isSafeMethod(request.method) && !isSameOriginWrite(h, panelOrigin())) {
    return Response.json({ message: 'این درخواست از خود پنل ارسال نشده است.', code: 'CROSS_SITE_REQUEST' }, { status: 403 });
  }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return Response.json({ message: 'نشست شما پایان یافته است. دوباره وارد شوید.', code: 'UNAUTHORIZED' }, { status: 401 });

  let body: ArrayBuffer | undefined;
  if (!isSafeMethod(request.method)) {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) {
      return Response.json({ message: 'حجم درخواست بیش از حد مجاز است.', code: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
    }
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return Response.json({ message: 'حجم درخواست بیش از حد مجاز است.', code: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
    }
  }

  let upstream: Response;
  try {
    upstream = await callUpstream({
      method: request.method,
      path: target,
      search: new URL(request.url).search,
      token,
      body: body && body.byteLength > 0 ? body : undefined,
      contentType: request.headers.get('content-type'),
      forwardedFor: forwardedFor(h),
    });
  } catch (error) {
    if (error instanceof UpstreamUnreachable) return unreachableResponse();
    throw error;
  }

  const out = new Headers({ 'cache-control': 'no-store' });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  if (upstream.status === 401) jar.set(clearedSessionCookie());
  const noBody = upstream.status === 204 || upstream.status === 304;
  return new Response(noBody ? null : upstream.body, { status: upstream.status, headers: out });
}
