import { addDays, addMonths } from './hesabpay.dates.js';

const d = (s: string) => new Date(s);

describe('addMonths', () => {
  it('adds calendar months and keeps the time of day', () => {
    expect(addMonths(d('2026-10-12T13:45:10.123Z'), 1).toISOString()).toBe('2026-11-12T13:45:10.123Z');
    expect(addMonths(d('2026-10-12T00:00:00Z'), 3).toISOString()).toBe('2027-01-12T00:00:00.000Z');
    expect(addMonths(d('2026-12-15T00:00:00Z'), 12).toISOString()).toBe('2027-12-15T00:00:00.000Z');
  });

  it('clamps to the last day of shorter months instead of spilling over', () => {
    expect(addMonths(d('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(d('2028-01-31T10:00:00Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(addMonths(d('2026-11-30T10:00:00Z'), 3).toISOString()).toBe('2027-02-28T10:00:00.000Z');
    expect(addMonths(d('2028-02-29T10:00:00Z'), 12).toISOString()).toBe('2029-02-28T10:00:00.000Z');
  });

  it('does not mutate its input', () => {
    const input = d('2026-01-31T00:00:00Z');
    addMonths(input, 1);
    expect(input.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});

describe('addDays', () => {
  it('adds whole days', () => {
    expect(addDays(d('2026-10-12T00:00:00Z'), 7).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });
});
