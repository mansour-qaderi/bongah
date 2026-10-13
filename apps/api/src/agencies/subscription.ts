import { Prisma, SubscriptionStatus, type SubscriptionPackage } from '../generated/prisma/client.js';

export interface ActiveSubscription {
  id: string;
  packageType: SubscriptionPackage;
  startDate: Date;
  endDate: Date;
}

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
): Promise<ActiveSubscription | null> {
  return db.subscription.findFirst({
    where: {
      agencyId,
      status: SubscriptionStatus.ACTIVE,
      startDate: { lte: now },
      endDate: { gt: now },
    },
    select: { id: true, packageType: true, startDate: true, endDate: true },
  });
}

/**
 * When an agency's publishing rights end, given the subscription running now and the ones
 * that end after it. Plans bought early are stored back to back (the new one starts when the
 * current one ends), so this follows that chain: a plan counts if it starts no later than the
 * point already covered. A plan that starts after a gap does not, because the agency would be
 * locked out in between.
 */
export function subscriptionCoveredUntil(
  runningEnd: Date,
  later: readonly { startDate: Date; endDate: Date }[],
): Date {
  let until = runningEnd;
  for (const next of [...later].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) {
    if (next.startDate.getTime() > until.getTime()) break; // a gap: nothing after it counts
    if (next.endDate.getTime() > until.getTime()) until = next.endDate;
  }
  return until;
}
