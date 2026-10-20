import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * A database client for the command line tools. Two differences from the one the server uses:
 *
 *  - It connects first and says plainly if it cannot. Without this, the first thing a tool does is open a transaction,
 *    and a database that is slow or unreachable shows up as Prisma's "Unable to start a transaction in the given time"
 *    (P2028), which names neither the database nor the cause.
 *  - Its transactions may take a while to start. The server connects once at boot and keeps its connections warm; a
 *    tool starts cold, and a first TLS connection to a hosted database can take longer than Prisma's 2 second default.
 */
export async function connectCliDb(url: string): Promise<PrismaClient> {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    transactionOptions: { maxWait: 30_000, timeout: 30_000 },
  });
  try {
    await db.$connect();
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    await db.$disconnect().catch(() => undefined);
    const reason = error instanceof Error ? (error.message.split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? error.name) : String(error);
    throw new CliDatabaseError(`Could not reach the database from DATABASE_URL (${reason.slice(0, 300)}).`);
  }
  return db;
}

/** A failure the command line shows as one line, without a stack trace. */
export class CliDatabaseError extends Error {}
