/**
 * Reading the expiry out of the API's access token (a JWT). This only decides whether to bother the user with the login
 * page early; it is NOT a check of the token (the API checks it on every request). Works on the Edge runtime too.
 */

/** The cookie that holds the access token. httpOnly: scripts in the page can never read it. */
export const SESSION_COOKIE = 'bongah_session';

function base64UrlToString(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The token's `exp` in milliseconds since 1970, or null when it has none or is not a token. */
export function tokenExpiry(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64UrlToString(parts[1]!)) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when there is no token, it cannot be read, or its time is up (with a little slack for clock differences). */
export function isTokenExpired(token: string | undefined | null, now = Date.now(), slackMs = 5_000): boolean {
  if (!token) return true;
  const expiry = tokenExpiry(token);
  return expiry === null || expiry - slackMs <= now;
}
