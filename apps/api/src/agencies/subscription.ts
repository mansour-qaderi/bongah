import { Prisma, SubscriptionStatus, type SubscriptionPackage } from '../generated/prisma/client.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

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

export interface SubscriptionSummary {
  /** The plan running now, or null. */
  running: ActiveSubscription | null;
  /** When publishing rights end, counting plans bought in advance; null when nothing is running. */
  until: Date | null;
  /** Plans that start in the future (bought in advance), earliest first. */
  queued: { packageType: SubscriptionPackage; startDate: Date; endDate: Date }[];
}

/**
 * The agency's subscription picture at `now`: what is running, how far it reaches, and what is
 * queued behind it. The dashboard and the wallet both read this, so they can never disagree about
 * how many days are left.
 */
export async function summariseSubscription(
  db: Prisma.TransactionClient,
  agencyId: string,
  now: Date,
): Promise<SubscriptionSummary> {
  const running = await findActiveSubscription(db, agencyId, now);
  if (!running) {
    const queued = await queuedSubscriptions(db, agencyId, now);
    return { running: null, until: null, queued };
  }
  // Plans bought in advance start when the running one ends: they extend the access.
  const later = await db.subscription.findMany({
    where: { agencyId, status: SubscriptionStatus.ACTIVE, endDate: { gt: running.endDate } },
    select: { packageType: true, startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
  });
  return {
    running,
    until: subscriptionCoveredUntil(running.endDate, later),
    queued: later.filter((plan) => plan.startDate.getTime() > now.getTime()),
  };
}

function queuedSubscriptions(db: Prisma.TransactionClient, agencyId: string, now: Date) {
  return db.subscription.findMany({
    where: { agencyId, status: SubscriptionStatus.ACTIVE, startDate: { gt: now } },
    select: { packageType: true, startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
  });
}
