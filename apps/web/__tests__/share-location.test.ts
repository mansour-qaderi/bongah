import { describe, expect, it } from 'vitest';
import {
  LISTING_LINK_BASE,
  MAP_LINK_BASE,
  buildLocationShare,
  coordinateText,
  listingLink,
  mapLink,
  telegramUrl,
  whatsappUrl,
  type ShareWords,
} from '@/lib/share-location';
import { translate } from '@/i18n/translate';

const words = (language: 'prs' | 'ps' = 'prs'): ShareWords => ({
  heading: (title) => (title ? translate(language, 'share.location.heading', { title }) : translate(language, 'share.location.headingPlain')),
  mapLine: translate(language, 'share.location.mapLine'),
  coordinates: (coords) => translate(language, 'share.location.coordinates', { coords }),
  listingLine: translate(language, 'share.location.listingLine'),
});

describe('the links', () => {
  it('writes the coordinates with six decimals and Latin digits, so every maps app reads them', () => {
    expect(coordinateText(34.5281, 69.1761)).toBe('34.528100, 69.176100');
    expect(coordinateText(34.52812345678, 69.17612345678)).toBe('34.528123, 69.176123');
  });

  it('makes a map link that opens the exact point', () => {
    expect(mapLink(34.5281, 69.1761)).toBe(`${MAP_LINK_BASE}34.528100%2C69.176100`);
    expect(decodeURIComponent(mapLink(34.5281, 69.1761).slice(MAP_LINK_BASE.length))).toBe('34.528100,69.176100');
  });

  it('links to the listing by its id, encoded so no id can break the address', () => {
    expect(listingLink('abc')).toBe(`${LISTING_LINK_BASE}abc`);
    expect(listingLink('a/b?c')).toBe(`${LISTING_LINK_BASE}a%2Fb%3Fc`);
  });

  it('builds the WhatsApp and Telegram addresses with everything encoded', () => {
    const wa = new URL(whatsappUrl('سلام\nhttps://x.test/?a=1&b=2'));
    expect(wa.origin + wa.pathname).toBe('https://wa.me/');
    expect(wa.searchParams.get('text')).toBe('سلام\nhttps://x.test/?a=1&b=2');
    const tg = new URL(telegramUrl('https://x.test/?a=1&b=2', 'متن'));
    expect(tg.origin + tg.pathname).toBe('https://t.me/share/url');
    expect(tg.searchParams.get('url')).toBe('https://x.test/?a=1&b=2');
    expect(tg.searchParams.get('text')).toBe('متن');
  });
});

describe('the message', () => {
  it('has the title, the address, the map link and the coordinates, in that order', () => {
    const share = buildLocationShare({ lat: 34.5281, lng: 69.1761, title: '  خانه   سه اتاقه ', address: 'کابل، شهر نو' }, words())!;
    const lines = share.text.split('\n');
    expect(lines).toEqual([
      '📍 موقعیت ملک: خانه سه اتاقه',
      'کابل، شهر نو',
      'موقعیت دقیق روی نقشه:',
      share.link,
      'مختصات: 34.528100, 69.176100',
    ]);
    expect(share.link).toBe(mapLink(34.5281, 69.1761));
  });

  it('adds the listing link only for a saved listing', () => {
    const saved = buildLocationShare({ lat: 34.5, lng: 69.1, listingId: 'L1' }, words())!;
    expect(saved.text.split('\n').slice(-2)).toEqual(['مشخصات کامل در بنگاه:', listingLink('L1')]);
    expect(buildLocationShare({ lat: 34.5, lng: 69.1 }, words())!.text).not.toContain(LISTING_LINK_BASE);
  });

  it('leaves the map link out of the Telegram text (Telegram takes it as its own field)', () => {
    const share = buildLocationShare({ lat: 34.5, lng: 69.1, title: 'x' }, words())!;
    expect(share.textWithoutLink).not.toContain(share.link);
    expect(share.text).toContain(share.link);
  });

  it('works without a title or an address, and in Pashto', () => {
    const plain = buildLocationShare({ lat: 34.5, lng: 69.1 }, words('ps'))!;
    expect(plain.text.split('\n')[0]).toBe('📍 د ملکیت ځای');
    expect(plain.text.split('\n')).toHaveLength(4);
  });

  it.each([
    [Number.NaN, 69],
    [34, Number.POSITIVE_INFINITY],
    [91, 69],
    [34, 181],
  ])('shares nothing for the position %s, %s', (lat, lng) => {
    expect(buildLocationShare({ lat, lng }, words())).toBeNull();
  });
});
