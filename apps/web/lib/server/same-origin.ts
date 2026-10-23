/**
 * Writes to the panel (POST, PATCH, PUT, DELETE) must come from the panel's own pages. The session cookie is
 * SameSite=Lax already; this is the second lock, so a form on another site cannot make a signed-in agency's browser
 * change their listings.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

interface HeaderReader {
  get(name: string): string | null;
}

/**
 * True when the request's `Origin` is this panel. The panel's address is `configuredOrigin` (PANEL_ORIGIN) when set;
 * otherwise the host the request was addressed to (behind a reverse proxy, the forwarded one).
 * With no `Origin` header at all (some browsers leave it off for same-origin requests) the browser's own
 * `Sec-Fetch-Site: same-origin` has to say so.
 */
export function isSameOriginWrite(headers: HeaderReader, configuredOrigin?: string): boolean {
  const origin = headers.get('origin');
  if (origin === null) return headers.get('sec-fetch-site') === 'same-origin';
  let asked: URL;
  try {
    asked = new URL(origin);
  } catch {
    return false;
  }
  if (configuredOrigin) return asked.origin === configuredOrigin;
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  return host !== null && asked.host === host.split(',')[0]!.trim();
}
