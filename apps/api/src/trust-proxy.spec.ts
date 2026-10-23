import { parseTrustProxy } from './trust-proxy.js';

describe('parseTrustProxy', () => {
  it('trusts nobody by default', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('  ')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('takes a number of proxy hops', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  it('refuses a number that is not a believable count of proxies', () => {
    expect(() => parseTrustProxy('0')).toThrow();
    expect(() => parseTrustProxy('11')).toThrow();
  });

  it('refuses "true", which would trust every caller', () => {
    expect(() => parseTrustProxy('true')).toThrow(/any caller/);
    expect(() => parseTrustProxy('TRUE')).toThrow(/any caller/);
  });

  it('takes names, addresses and ranges, comma-separated', () => {
    expect(parseTrustProxy('loopback')).toEqual(['loopback']);
    expect(parseTrustProxy('127.0.0.1, 10.0.0.0/8')).toEqual(['127.0.0.1', '10.0.0.0/8']);
    expect(parseTrustProxy('::1,fd00::/8')).toEqual(['::1', 'fd00::/8']);
  });

  it('refuses anything else, so a typo cannot silently trust the wrong thing', () => {
    expect(() => parseTrustProxy('everyone')).toThrow(/not "loopback"/);
    expect(() => parseTrustProxy('loopback, *')).toThrow();
  });
});
