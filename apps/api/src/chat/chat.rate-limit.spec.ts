import { SlidingWindowLimiter } from './chat.rate-limit.js';

describe('SlidingWindowLimiter', () => {
  it('allows the limit, refuses the next, and frees a slot as the window moves on', () => {
    const limiter = new SlidingWindowLimiter(3, 60_000);
    expect([0, 1000, 2000].map((t) => limiter.tryAcquire('a', t))).toEqual([true, true, true]);
    expect(limiter.tryAcquire('a', 3000)).toBe(false);
    // 60s after the first hit it has left the window.
    expect(limiter.tryAcquire('a', 60_001)).toBe(true);
    expect(limiter.tryAcquire('a', 60_002)).toBe(false);
  });

  it('does not count refused attempts against the person', () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    expect(limiter.tryAcquire('a', 0)).toBe(true);
    for (let t = 1; t < 900; t += 100) expect(limiter.tryAcquire('a', t)).toBe(false);
    expect(limiter.tryAcquire('a', 1001)).toBe(true);
  });

  it('keeps people apart', () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    expect(limiter.tryAcquire('a', 0)).toBe(true);
    expect(limiter.tryAcquire('b', 0)).toBe(true);
    expect(limiter.tryAcquire('a', 1)).toBe(false);
  });

  it('says how long to wait', () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    limiter.tryAcquire('a', 0);
    expect(limiter.retryAfterSeconds('a', 10_000)).toBe(50);
    expect(limiter.retryAfterSeconds('nobody', 0)).toBe(0);
  });
});
