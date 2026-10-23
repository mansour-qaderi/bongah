import { describe, expect, it } from 'vitest';
import { forwardedFor } from '../lib/server/client-ip';
import { isSafeMethod, isSameOriginWrite } from '../lib/server/same-origin';
import { upstreamPath } from '../lib/server/upstream';
import { isTokenExpired, tokenExpiry } from '../lib/session-token';
import { safePaymentUrl } from '../lib/payments';

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const jwt = (exp?: number) => {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256' })}.${b(exp === undefined ? {} : { exp })}.sig`;
};

describe('upstreamPath', () => {
  it('joins and encodes normal segments', () => {
    expect(upstreamPath(['properties', 'mine'])).toBe('properties/mine');
    expect(upstreamPath(['properties', 'a b'])).toBe('properties/a%20b');
  });
  it.each([[[]], [['']], [['..', 'users']], [['properties', '.']], [['a/b']], [['a\\b']], [['a\0b']]])('refuses %j', (segs) => {
    expect(upstreamPath(segs as string[])).toBeNull();
  });
  it('refuses sign-in and the payment webhook', () => {
    expect(upstreamPath(['auth', 'verify-otp'])).toBeNull();
    expect(upstreamPath(['hesabpay', 'webhook'])).toBeNull();
    expect(upstreamPath(['hesabpay', 'payments'])).toBe('hesabpay/payments');
  });
});

describe('same-origin writes', () => {
  it('knows safe methods', () => {
    expect(isSafeMethod('get')).toBe(true);
    expect(isSafeMethod('POST')).toBe(false);
  });
  it('accepts the configured origin and refuses others', () => {
    expect(isSameOriginWrite(h({ origin: 'https://panel.example' }), 'https://panel.example')).toBe(true);
    expect(isSameOriginWrite(h({ origin: 'https://evil.example' }), 'https://panel.example')).toBe(false);
    expect(isSameOriginWrite(h({ origin: 'not a url' }), 'https://panel.example')).toBe(false);
  });
  it('falls back to the host when nothing is configured', () => {
    expect(isSameOriginWrite(h({ origin: 'http://localhost:3100', host: 'localhost:3100' }))).toBe(true);
    expect(isSameOriginWrite(h({ origin: 'http://evil.test', host: 'localhost:3100' }))).toBe(false);
    expect(isSameOriginWrite(h({ origin: 'http://a.test', 'x-forwarded-host': 'a.test, b.test', host: 'x' }))).toBe(true);
  });
  it('without Origin needs Sec-Fetch-Site: same-origin', () => {
    expect(isSameOriginWrite(h({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(isSameOriginWrite(h({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isSameOriginWrite(h({}))).toBe(false);
  });
});

describe('session token', () => {
  it('reads exp', () => {
    expect(tokenExpiry(jwt(2000))).toBe(2_000_000);
    expect(tokenExpiry(jwt())).toBeNull();
    expect(tokenExpiry('junk')).toBeNull();
    expect(tokenExpiry('a.b.c')).toBeNull();
  });
  it('decides expiry with slack', () => {
    const now = 1_000_000;
    expect(isTokenExpired(jwt(now / 1000 + 600), now)).toBe(false);
    expect(isTokenExpired(jwt(now / 1000 + 2), now)).toBe(true);
    expect(isTokenExpired(jwt(now / 1000 - 5), now)).toBe(true);
    expect(isTokenExpired(undefined)).toBe(true);
    expect(isTokenExpired('junk')).toBe(true);
  });
});

describe('forwardedFor / payment url', () => {
  it('passes the chain, capped', () => {
    expect(forwardedFor(h({ 'x-forwarded-for': ' 1.2.3.4, 5.6.7.8 ' }))).toBe('1.2.3.4, 5.6.7.8');
    expect(forwardedFor(h({}))).toBeNull();
    expect(forwardedFor(h({ 'x-forwarded-for': 'a'.repeat(900) }))?.length).toBe(500);
  });
  it('follows only web addresses', () => {
    expect(safePaymentUrl('https://pay.example/x?id=1')).toBe('https://pay.example/x?id=1');
    expect(safePaymentUrl('javascript:alert(1)')).toBeNull();
    expect(safePaymentUrl('data:text/html,hi')).toBeNull();
    expect(safePaymentUrl('nonsense')).toBeNull();
  });
});
