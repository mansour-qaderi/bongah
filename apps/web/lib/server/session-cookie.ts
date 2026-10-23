import { SESSION_COOKIE } from '../session-token';
import { secureCookies } from './env';

export { SESSION_COOKIE };

/** `Set-Cookie` options for the session: out of reach of scripts, never sent from another site's page. */
export function sessionCookie(maxAgeSeconds: number) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function clearedSessionCookie() {
  return { ...sessionCookie(0), value: '' };
}
