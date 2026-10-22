import { describe, expect, it } from 'vitest';
import { readPoolSettings } from './prisma.pool.js';

const config = (env: Record<string, string> = {}) => ({ get: <T>(name: string) => env[name] as T | undefined });

describe('readPoolSettings', () => {
  it('keeps idle connections far longer than pg default (10 s) and waits longer than Prisma default (2 s)', () => {
    const s = readPoolSettings(config());
    expect(s.pool.idleTimeoutMillis).toBeGreaterThan(10_000);
    expect(s.transactionMaxWaitMs).toBeGreaterThan(2_000);
    expect(s.pool.keepAlive).toBe(true);
  });

  it('reads overrides and rejects nonsense', () => {
    expect(readPoolSettings(config({ DB_POOL_MAX: '4' })).pool.max).toBe(4);
    expect(() => readPoolSettings(config({ DB_POOL_MAX: '0' }))).toThrow(/DB_POOL_MAX/);
    expect(() => readPoolSettings(config({ DB_IDLE_TIMEOUT_MS: 'soon' }))).toThrow(/DB_IDLE_TIMEOUT_MS/);
  });
});
