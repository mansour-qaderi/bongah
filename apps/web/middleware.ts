import { NextResponse, type NextRequest } from 'next/server';
import { isTokenExpired, SESSION_COOKIE } from '@/lib/session-token';

/**
 * Sends people to the right page early: signed-out visitors to /login, signed-in ones away from it. This only looks at
 * the cookie's expiry; the API checks the token itself on every call (and a 401 signs the person out).
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = !isTokenExpired(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith('/dashboard') && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    const back = pathname + search;
    if (back !== '/dashboard') url.searchParams.set('next', back);
    const response = NextResponse.redirect(url);
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  if (pathname === '/login' && signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/login'] };
