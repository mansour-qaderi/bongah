import { parseCorsOrigins } from './cors.js';

describe('parseCorsOrigins', () => {
  it('means no browser access when nothing is configured', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins(' , ,')).toEqual([]);
  });

  it('reads a comma-separated list, trimming spaces and a trailing slash', () => {
    expect(parseCorsOrigins('https://admin.bongah.example, https://agency.bongah.example/')).toEqual([
      'https://admin.bongah.example',
      'https://agency.bongah.example',
    ]);
    expect(parseCorsOrigins('http://localhost:3001')).toEqual(['http://localhost:3001']);
  });

  it.each([
    ['a wildcard', '*'],
    ['a wildcard subdomain', 'https://*.bongah.example'],
    ['a path', 'https://admin.bongah.example/app'],
    ['a query', 'https://admin.bongah.example?x=1'],
    ['no scheme', 'admin.bongah.example'],
    ['another scheme', 'ftp://admin.bongah.example'],
    ['one bad entry among good ones', 'https://admin.bongah.example,nope'],
  ])('refuses %s, naming the bad entry', (_name, raw) => {
    expect(() => parseCorsOrigins(raw)).toThrow(/CORS_ORIGINS/);
  });
});
