import { afterEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { RetryingPool } from './prisma.retrying-pool.js';

const noSleep = async () => undefined;
const transient = () => new Error('Connection terminated due to connection timeout');
const fakeClient = () => ({ release: vi.fn() }) as unknown as pg.PoolClient;

function pool(retries: number, onRetry = vi.fn()) {
  const p = new RetryingPool({ connectionString: 'postgresql://u:p@127.0.0.1:1/db' }, { retries, baseDelayMs: 10, sleep: noSleep, onRetry });
  return { p, onRetry };
}

describe('RetryingPool', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is accepted by the Prisma adapter as the pool itself (one copy of pg, so instanceof holds)', () => {
    const { p } = pool(1);
    expect(p).toBeInstanceOf(pg.Pool);
    expect((new PrismaPg(p) as unknown as { externalPool: unknown }).externalPool).toBe(p);
  });

  it('tries again when opening a connection fails for a network reason, then succeeds', async () => {
    const { p, onRetry } = pool(2);
    const client = fakeClient();
    const base = vi.spyOn(pg.Pool.prototype, 'connect' as never) as unknown as ReturnType<typeof vi.fn>;
    base.mockRejectedValueOnce(transient()).mockRejectedValueOnce(transient()).mockResolvedValueOnce(client);
    await expect(p.connect()).resolves.toBe(client);
    expect(base).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured retries and throws the last error', async () => {
    const { p } = pool(1);
    const base = vi.spyOn(pg.Pool.prototype, 'connect' as never) as unknown as ReturnType<typeof vi.fn>;
    base.mockRejectedValue(transient());
    await expect(p.connect()).rejects.toThrow('Connection terminated due to connection timeout');
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('never retries an error that is not about the connection', async () => {
    const { p, onRetry } = pool(3);
    const base = vi.spyOn(pg.Pool.prototype, 'connect' as never) as unknown as ReturnType<typeof vi.fn>;
    base.mockRejectedValue(new Error('timeout exceeded when trying to connect'));
    await expect(p.connect()).rejects.toThrow('timeout exceeded');
    expect(base).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not retry when retries is 0', async () => {
    const { p } = pool(0);
    const base = vi.spyOn(pg.Pool.prototype, 'connect' as never) as unknown as ReturnType<typeof vi.fn>;
    base.mockRejectedValue(transient());
    await expect(p.connect()).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('also covers the callback form that pool.query() uses inside pg-pool', async () => {
    const { p } = pool(1);
    const client = fakeClient();
    const base = vi.spyOn(pg.Pool.prototype, 'connect' as never) as unknown as ReturnType<typeof vi.fn>;
    base.mockRejectedValueOnce(transient()).mockResolvedValueOnce(client);
    const result = await new Promise<{ err: Error | undefined; client: pg.PoolClient | undefined }>((resolve) =>
      p.connect((err, c) => resolve({ err, client: c })),
    );
    expect(result.err).toBeUndefined();
    expect(result.client).toBe(client);
  });

  it('passes a failure to the callback instead of throwing', async () => {
    const { p } = pool(0);
    const base = vi.spyOn(pg.Pool.prototype, 'connect' as never) as unknown as ReturnType<typeof vi.fn>;
    base.mockRejectedValue(transient());
    const err = await new Promise<Error | undefined>((resolve) => p.connect((e) => resolve(e)));
    expect(err?.message).toContain('Connection terminated');
  });
});
