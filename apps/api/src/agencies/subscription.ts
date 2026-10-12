import { Prisma, SubscriptionStatus } from '../generated/prisma/client.js';

/**
 * The agency's subscription that is running at `now`, or null.
 *
 * This is THE definition of "has an active subscription" for publishing and for unlimited map
 * pins. Keep it in one place: two slightly different copies would let a lapsed agency do one
 * thing but not the other.
 */
export function findActiveSubscription(
  db: Prisma.TransactionClient,
  agencyId: string,
  now: Date,
): Promise<{ id: string } | null> {
  return db.subscription.findFirst({
    where: {
      agencyId,
      status: SubscriptionStatus.ACTIVE,
      startDate: { lte: now },
      endDate: { gt: now },
    },
    select: { id: true },
  });
}
