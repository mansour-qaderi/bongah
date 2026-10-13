import { kabulDayKey, nextKabulMidnight } from './contact.time.js';

const iso = (d: Date) => d.toISOString();

describe('Kabul day boundaries', () => {
  it('names the day by the Kabul calendar, not the UTC one', () => {
    // 19:29 UTC is 23:59 in Kabul: still the same Kabul day as 12:00 UTC.
    expect(iso(kabulDayKey(new Date('2026-10-13T19:29:59.999Z')))).toBe('2026-10-13T00:00:00.000Z');
    expect(iso(kabulDayKey(new Date('2026-10-13T12:00:00Z')))).toBe('2026-10-13T00:00:00.000Z');
    // One millisecond later it is midnight in Kabul: the next day, though UTC has hours to go.
    expect(iso(kabulDayKey(new Date('2026-10-13T19:30:00.000Z')))).toBe('2026-10-14T00:00:00.000Z');
  });

  it('puts the very early Kabul hours on the Kabul date, which is already "tomorrow" in UTC terms', () => {
    // 00:10 UTC on the 14th is 04:40 in Kabul on the 14th.
    expect(iso(kabulDayKey(new Date('2026-10-14T00:10:00Z')))).toBe('2026-10-14T00:00:00.000Z');
    // 20:00 UTC on the 13th is 00:30 in Kabul on the 14th.
    expect(iso(kabulDayKey(new Date('2026-10-13T20:00:00Z')))).toBe('2026-10-14T00:00:00.000Z');
  });

  it('refills at the next Kabul midnight, which is 19:30 UTC', () => {
    expect(iso(nextKabulMidnight(new Date('2026-10-13T12:00:00Z')))).toBe('2026-10-13T19:30:00.000Z');
    expect(iso(nextKabulMidnight(new Date('2026-10-13T19:29:59.999Z')))).toBe('2026-10-13T19:30:00.000Z');
    expect(iso(nextKabulMidnight(new Date('2026-10-13T19:30:00.000Z')))).toBe('2026-10-14T19:30:00.000Z');
  });

  it('rolls over month and year ends', () => {
    expect(iso(kabulDayKey(new Date('2026-12-31T20:00:00Z')))).toBe('2027-01-01T00:00:00.000Z');
    expect(iso(nextKabulMidnight(new Date('2026-12-31T20:00:00Z')))).toBe('2027-01-01T19:30:00.000Z');
  });
});
