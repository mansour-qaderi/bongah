import { SUBSCRIPTION_PLAN_BENEFITS, type ListingQuota } from '@bongah/shared-types';
import { isTrialRunning } from '../agencies/trial.js';
import { Role, SubscriptionStatus, type Prisma } from '../generated/prisma/client.js';
import { FREE_LISTINGS_PER_MONTH } from './property.constants.js';
import { kabulMonthStart, nextKabulMonthStart } from './property.time.js';

/** What the account row says about listing credits (the gift credits that pay on top of the free listings). */
export interface QuotaUser {
  role: Role;
  welcomeListingCredits: number;
  bonusListingCredits: number;
  agency: { id: string; trialEndsAt?: Date | null; trialListingsUsed?: number } | null;
}

/**
 * How many listings the account can still publish, read the same way PropertyService.create spends them: a regular
 * user's free listing(s) for the Kabul month (a listing the welcome gift paid for is not one of them), an office's
 * share of its running plan, and the gift credits on top of either.
 */
export async function readListingQuota(
  db: Prisma.TransactionClient,
  userId: string,
  user: QuotaUser,
  now: Date,
  /** What an agency's free trial allows (AGENCY_TRIAL_LISTINGS). Only the wallet reads it; without it a trial is not counted. */
  trialListings = 0,
): Promise<ListingQuota> {
  if (user.role === Role.ADMIN) return { limit: null, used: 0, extra: 0, resets_at: null };
  if (user.role === Role.USER) {
    const used = await db.property.count({
      where: { userId, createdAt: { gte: kabulMonthStart(now) }, usedWelcomeCredit: false },
    });
    return {
      limit: FREE_LISTINGS_PER_MONTH,
      used: Math.min(used, FREE_LISTINGS_PER_MONTH),
      extra: Math.max(0, user.welcomeListingCredits),
      resets_at: nextKabulMonthStart(now).toISOString(),
    };
  }
  const running = user.agency
    ? await db.subscription.findFirst({
        where: {
          agencyId: user.agency.id,
          status: SubscriptionStatus.ACTIVE,
          startDate: { lte: now },
          endDate: { gt: now },
        },
        select: { packageType: true, listingsUsed: true, endDate: true },
      })
    : null;
  if (!running) {
    // No plan, but the free trial may be paying for listings: its allowance is what the office can still publish.
    // (Bonus listings are not on offer: they are spent by a plan, and the trial has none.)
    if (user.agency && trialListings > 0 && isTrialRunning(user.agency.trialEndsAt ?? null, now)) {
      return {
        limit: trialListings,
        used: Math.min(user.agency.trialListingsUsed ?? 0, trialListings),
        extra: 0,
        resets_at: user.agency.trialEndsAt!.toISOString(),
      };
    }
    // Otherwise an office without a running plan cannot publish at all.
    return { limit: 0, used: 0, extra: 0, resets_at: null };
  }
  const limit = SUBSCRIPTION_PLAN_BENEFITS[running.packageType].listings;
  return {
    limit,
    used: Math.min(running.listingsUsed, limit),
    extra: Math.max(0, user.bonusListingCredits),
    resets_at: running.endDate.toISOString(),
  };
}
