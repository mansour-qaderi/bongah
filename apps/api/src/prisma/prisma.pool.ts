import type { ConfigService } from '@nestjs/config';
import type { PoolConfig } from 'pg';

/**
 * How the API keeps its database connections.
 *
 * Why this exists: `pg`'s pool closes a connection after 10 seconds without use, and Prisma gives a query only 2
 * seconds to get a connection (`maxWait`) before it throws P2028 "Unable to start a transaction in the given time".
 * With a hosted database (Supabase from Afghanistan: a TLS handshake and sign-in over a long round trip) a first
 * connection routinely takes longer than 2 seconds. So after any quiet spell the next request, usually the first list
 * or map call of a session, paid for a cold connection and failed. Keeping idle connections for minutes and allowing
 * a slow start fixes that for every query, not only the one that happened to log the error.
 *
 *  - DB_POOL_MAX                   connections held at most (default 10; a pooler has its own, smaller limit).
 *  - DB_IDLE_TIMEOUT_MS            how long an unused connection is kept (default 5 minutes).
 *  - DB_CONNECT_TIMEOUT_MS         how long to wait for a new connection to open (default 15 s).
 *  - DB_TRANSACTION_MAX_WAIT_MS    how long a query/transaction waits for a free connection (default 10 s).
 */
export interface PoolSettings {
  pool: Pick<PoolConfig, 'max' | 'idleTimeoutMillis' | 'connectionTimeoutMillis' | 'keepAlive'>;
  transactionMaxWaitMs: number;
  transactionTimeoutMs: number;
}

function whole(config: Pick<ConfigService, 'get'>, name: string, fallback: number, min: number, max: number): number {
  const raw = (config.get<string>(name) ?? '').toString().trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

export function readPoolSettings(config: Pick<ConfigService, 'get'>): PoolSettings {
  return {
    pool: {
      max: whole(config, 'DB_POOL_MAX', 10, 1, 100),
      idleTimeoutMillis: whole(config, 'DB_IDLE_TIMEOUT_MS', 300_000, 1_000, 3_600_000),
      connectionTimeoutMillis: whole(config, 'DB_CONNECT_TIMEOUT_MS', 15_000, 1_000, 60_000),
      keepAlive: true,
    },
    transactionMaxWaitMs: whole(config, 'DB_TRANSACTION_MAX_WAIT_MS', 10_000, 1_000, 60_000),
    transactionTimeoutMs: 15_000,
  };
}
