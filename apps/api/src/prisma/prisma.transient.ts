/**
 * Telling "the database could not be reached right now" apart from every other error, so the API can retry what is
 * safe to retry and answer 503 (try again) instead of 500 (a bug) for the rest.
 *
 * What counts: failures that happen while a connection is being opened or after the other side dropped it: the
 * pg-pool/pg messages ("Connection terminated due to connection timeout" is pg-pool giving up on opening a new
 * connection; "Connection terminated unexpectedly" is the server or a proxy closing it mid-handshake), the usual
 * socket error codes, Postgres "cannot connect now" classes, and Prisma's own connection error codes. Anything else
 * (a constraint violation, a bad query, "timeout exceeded when trying to connect", which is waiting for a free
 * connection rather than opening one) is NOT transient: retrying it would repeat the failure or hide a real problem.
 */
const SOCKET_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND']);
/** 08xxx connection exceptions, 57P01 admin shutdown, 57P02 crash shutdown, 57P03 cannot connect now, 53300 too many connections. */
const POSTGRES_CODES = /^(08\w{3}|57P0[123]|53300)$/;
/** Prisma: can't reach (P1001), timed out (P1002, P1008), connection closed (P1017), no connection from the pool in time (P2024). */
const PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const MESSAGES = /connection terminated|connection error|connection timeout|terminating connection|server closed the connection|the database system is (starting up|shutting down)/i;

/** How many `cause`s deep to look: the adapter wraps the driver's error, which can wrap the socket's. */
const MAX_DEPTH = 4;

export function isTransientDbError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_DEPTH && current && typeof current === 'object'; depth += 1) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown; kind?: unknown };
    if (typeof e.code === 'string' && (SOCKET_CODES.has(e.code) || POSTGRES_CODES.test(e.code) || PRISMA_CODES.has(e.code))) return true;
    if (typeof e.message === 'string' && MESSAGES.test(e.message)) return true;
    current = e.cause;
  }
  return false;
}
