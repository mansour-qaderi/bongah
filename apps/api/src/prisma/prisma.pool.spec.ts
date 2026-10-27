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

  it('retries opening a connection twice and keeps a connection warm every minute, unless told otherwise', () => {
    const s = readPoolSettings(config());
    expect(s.connectRetries).toBe(2);
    expect(s.keepAliveIntervalMs).toBe(60_000);
    expect(readPoolSettings(config({ DB_CONNECT_RETRIES: '0' })).connectRetries).toBe(0);
    expect(readPoolSettings(config({ DB_KEEPALIVE_INTERVAL_MS: '0' })).keepAliveIntervalMs).toBe(0);
    expect(() => readPoolSettings(config({ DB_KEEPALIVE_INTERVAL_MS: '10' }))).toThrow(/DB_KEEPALIVE_INTERVAL_MS/);
    expect(() => readPoolSettings(config({ DB_CONNECT_RETRIES: '9' }))).toThrow(/DB_CONNECT_RETRIES/);
  });

  it('reads overrides and rejects nonsense', () => {
    expect(readPoolSettings(config({ DB_POOL_MAX: '4' })).pool.max).toBe(4);
    expect(() => readPoolSettings(config({ DB_POOL_MAX: '0' }))).toThrow(/DB_POOL_MAX/);
    expect(() => readPoolSettings(config({ DB_IDLE_TIMEOUT_MS: 'soon' }))).toThrow(/DB_IDLE_TIMEOUT_MS/);
  });
});
