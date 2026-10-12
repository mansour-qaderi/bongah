import { kabulMonthStart, nextKabulMonthStart } from './property.time.js';

const iso = (d: Date) => d.toISOString();

describe('Kabul calendar month boundaries', () => {
  it('starts the month at 00:00 Kabul time, which is 19:30 UTC the evening before', () => {
    const now = new Date('2026-10-12T16:00:00Z');
    expect(iso(kabulMonthStart(now))).toBe('2026-09-30T19:30:00.000Z');
    expect(iso(nextKabulMonthStart(now))).toBe('2026-10-31T19:30:00.000Z');
  });

  it('switches month at exactly the Kabul boundary, not the UTC one', () => {
    // 23:59:59.999 Kabul on 30 Sep is still September; one millisecond later is October.
    expect(iso(kabulMonthStart(new Date('2026-09-30T19:29:59.999Z')))).toBe('2026-08-31T19:30:00.000Z');
    expect(iso(kabulMonthStart(new Date('2026-09-30T19:30:00.000Z')))).toBe('2026-09-30T19:30:00.000Z');
    // 1 Oct 00:00 UTC is already 04:30 on 1 Oct in Kabul: October either way.
    expect(iso(kabulMonthStart(new Date('2026-10-01T00:00:00Z')))).toBe('2026-09-30T19:30:00.000Z');
  });

  it('rolls over the year', () => {
    const now = new Date('2026-12-31T20:00:00Z'); // 00:30 on 1 Jan in Kabul
    expect(iso(kabulMonthStart(now))).toBe('2026-12-31T19:30:00.000Z');
    expect(iso(nextKabulMonthStart(now))).toBe('2027-01-31T19:30:00.000Z');
    const december = new Date('2026-12-15T10:00:00Z');
    expect(iso(nextKabulMonthStart(december))).toBe('2026-12-31T19:30:00.000Z');
  });

  it('handles February in a leap year', () => {
    expect(iso(nextKabulMonthStart(new Date('2028-02-10T10:00:00Z')))).toBe('2028-02-29T19:30:00.000Z');
  });
});
