import { describe, expect, it } from 'vitest';
import { forgetPayment, livePending, paymentDoneText, PENDING_MAX_AGE_MS, readPending, rememberPayment } from '../lib/pending-payments';

describe('pending payments', () => {
  const now = Date.UTC(2026, 9, 23, 12);

  it('drops what is too old or malformed', () => {
    const fresh = { id: 'a', purpose: 'SUBSCRIPTION', startedAt: now - 1000 };
    const stale = { id: 'b', purpose: 'LADDER', startedAt: now - PENDING_MAX_AGE_MS - 1 };
    expect(livePending([fresh, stale, null, { id: 3 }, 'x'], now)).toEqual([fresh]);
    expect(livePending('nope', now)).toEqual([]);
    expect(livePending(undefined, now)).toEqual([]);
  });

  it('remembers a payment once, and forgets it when it is settled', () => {
    rememberPayment({ id: 'p1', purpose: 'SUBSCRIPTION' }, now);
    rememberPayment({ id: 'p1', purpose: 'SUBSCRIPTION' }, now + 5);
    rememberPayment({ id: 'p2', purpose: 'LADDER' }, now + 10);
    expect(readPending(now + 20).map((p) => p.id)).toEqual(['p1', 'p2']);
    forgetPayment('p1', now + 20);
    expect(readPending(now + 20).map((p) => p.id)).toEqual(['p2']);
    forgetPayment('p2', now + 20);
    expect(readPending(now + 20)).toEqual([]);
  });

  it('remembers that a payment is paid by hand', () => {
    rememberPayment({ id: 'm1', purpose: 'SUBSCRIPTION', manual: true }, now);
    expect(readPending(now + 1)).toEqual([{ id: 'm1', purpose: 'SUBSCRIPTION', manual: true, startedAt: now }]);
    forgetPayment('m1', now + 1);
  });

  it('keeps only the last few', () => {
    for (let i = 0; i < 12; i += 1) rememberPayment({ id: `q${i}`, purpose: 'LADDER' }, now + i);
    const ids = readPending(now + 100).map((p) => p.id);
    expect(ids).toHaveLength(8);
    expect(ids.at(-1)).toBe('q11');
    for (const id of ids) forgetPayment(id, now + 100);
  });

  it('says what each payment bought', () => {
    expect(paymentDoneText('SUBSCRIPTION')).toContain('اشتراک');
    expect(paymentDoneText('LADDER')).toContain('نردبان');
    expect(paymentDoneText('MAP_LOCATION')).toContain('موفقیت');
  });
});
