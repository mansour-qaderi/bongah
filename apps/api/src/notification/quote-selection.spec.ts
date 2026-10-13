import { dayNumber, pickMorningQuote } from './quote-selection.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const byLanguage = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

describe('pickMorningQuote', () => {
  it('is null only when there are no quotes at all', () => {
    expect(pickMorningQuote(byLanguage({}), 'prs', day('2031-03-10'))).toBeNull();
    expect(pickMorningQuote(byLanguage({ prs: [] }), 'prs', day('2031-03-10'))).toBeNull();
  });

  it('is the same all day and moves to the next quote each day, wrapping around', () => {
    const quotes = byLanguage({ prs: ['a', 'b', 'c'] });
    const picks = ['10', '11', '12', '13', '14'].map((d) => pickMorningQuote(quotes, 'prs', day(`2031-03-${d}`)));
    expect(picks.slice(0, 3).sort()).toEqual(['a', 'b', 'c']);
    expect(picks[3]).toBe(picks[0]);
    expect(picks[4]).toBe(picks[1]);
    expect(pickMorningQuote(quotes, 'prs', day('2031-03-10'))).toBe(picks[0]);
  });

  it('prefers the language asked for, then Dari, then anything', () => {
    expect(pickMorningQuote(byLanguage({ prs: ['dari'], ps: ['pashto'] }), 'ps', day('2031-03-10'))).toBe('pashto');
    expect(pickMorningQuote(byLanguage({ prs: ['dari'], ps: [] }), 'ps', day('2031-03-10'))).toBe('dari');
    expect(pickMorningQuote(byLanguage({ ps: ['pashto'] }), 'prs', day('2031-03-10'))).toBe('pashto');
  });

  it('counts whole days from the Kabul day key', () => {
    expect(dayNumber(day('1970-01-02'))).toBe(1);
    expect(dayNumber(day('2031-03-11')) - dayNumber(day('2031-03-10'))).toBe(1);
  });
});
