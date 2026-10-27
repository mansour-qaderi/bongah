import pg from 'pg';
import { isTransientDbError } from './prisma.transient.js';

export interface ConnectRetryOptions {
  /** How many times to try again after the first failure (0 = never retry). */
  retries: number;
  /** The wait before the first retry; it doubles each time. */
  baseDelayMs: number;
  /** Called before each retry, for logging. */
  onRetry?: (attempt: number, error: unknown) => void;
  /** Replaceable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

type ConnectCallback = (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void;

/**
 * A `pg` pool that tries again when opening a NEW connection fails for a reason that is about the network, not the
 * query (see prisma.transient.ts).
 *
 * Why: to a hosted database over a long, lossy route, opening a connection (TCP, TLS, sign-in) sometimes simply
 * stalls; `pg` then reports "Connection terminated due to connection timeout" after `connectionTimeoutMillis`, and the
 * request that happened to need the connection failed with a 500. A fresh attempt usually succeeds at once, so a
 * quiet retry hides the stall from the caller. It is safe because nothing has been sent yet: no query has run on a
 * connection that failed to open. Failures of a query that is already running are never retried here.
 *
 * Both ways of asking for a connection are covered: `connect()` (Prisma transactions) and the callback form that
 * `pool.query()` uses inside `pg-pool` (every other Prisma query).
 */
export class RetryingPool extends pg.Pool {
  constructor(
    config: pg.PoolConfig,
    private readonly retryOptions: ConnectRetryOptions,
  ) {
    super(config);
  }

  override connect(): Promise<pg.PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<pg.PoolClient> | void {
    if (!callback) return this.connectWithRetry();
    this.connectWithRetry().then(
      (client) => callback(undefined, client, (release) => client.release(release as Error | boolean | undefined)),
      (error: Error) => callback(error, undefined, () => undefined),
    );
  }

  private async connectWithRetry(): Promise<pg.PoolClient> {
    const { retries, baseDelayMs, onRetry } = this.retryOptions;
    const sleep = this.retryOptions.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await super.connect();
      } catch (error) {
        if (attempt >= retries || !isTransientDbError(error)) throw error;
        onRetry?.(attempt + 1, error);
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
  }
}
