import { Prisma, type MapLocationTokenSource } from '../generated/prisma/client.js';

/**
 * Prepaid map pins. Plain functions over a Prisma client so a payment (which already runs inside
 * a transaction) and a listing write can both use them without importing each other's modules.
 */

/** Adds one unspent token for `userId`. A purchase passes its payment id, which is UNIQUE: replaying it fails instead of minting a second token. */
export async function grantMapLocationToken(
  db: Prisma.TransactionClient,
  grant: { userId: string; source: MapLocationTokenSource; transactionId?: string },
): Promise<void> {
  await db.mapLocationToken.create({
    data: {
      userId: grant.userId,
      source: grant.source,
      transactionId: grant.transactionId ?? null,
    },
  });
}

/**
 * Spends the user's oldest unspent token on `propertyId`. Returns false when they have none.
 *
 * One statement, so there is no gap between "find a token" and "mark it spent". SKIP LOCKED makes
 * two concurrent listings by the same user pick DIFFERENT tokens instead of queueing on, or both
 * taking, the same one; the UNIQUE property_id column is the final backstop.
 */
export async function claimMapLocationToken(
  db: Prisma.TransactionClient,
  userId: string,
  propertyId: string,
  now: Date,
): Promise<boolean> {
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE map_location_tokens
       SET consumed_at = ${now}, property_id = ${propertyId}::uuid
     WHERE id = (
       SELECT id FROM map_location_tokens
        WHERE user_id = ${userId}::uuid AND consumed_at IS NULL
        ORDER BY created_at, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
    RETURNING id`;
  return claimed.length === 1;
}

export function countAvailableTokens(db: Prisma.TransactionClient, userId: string): Promise<number> {
  return db.mapLocationToken.count({ where: { userId, consumedAt: null } });
}
