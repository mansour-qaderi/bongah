import { Prisma } from '../generated/prisma/client.js';
import { DAY_MS } from './subscription.js';
import type { AgencyTrialSettings } from './trial.config.js';

/** When a trial that starts at `now` ends, or null when trials are switched off. */
export function trialEndFor(now: Date, settings: AgencyTrialSettings): Date | null {
  return settings.days > 0 ? new Date(now.getTime() + settings.days * DAY_MS) : null;
}

/** Whether a trial that ends at `endsAt` is still running at `now`. */
export function isTrialRunning(endsAt: Date | null, now: Date): boolean {
  return endsAt !== null && endsAt.getTime() > now.getTime();
}

/**
 * Takes one of the agency's trial listings. One conditional UPDATE both checks that the trial is running and that the
 * limit is not reached and takes the slot, so two simultaneous requests cannot both take the last one.
 * Returns false when there is no slot to take (the caller says why with `whyNoTrialListing`).
 */
export async function takeTrialListing(
  db: Prisma.TransactionClient,
  agencyId: string,
  now: Date,
  limit: number,
): Promise<boolean> {
  const taken = await db.$executeRaw`
    UPDATE agencies SET trial_listings_used = trial_listings_used + 1
     WHERE id = ${agencyId}::uuid AND trial_ends_at > ${now} AND trial_listings_used < ${limit}`;
  return taken === 1;
}

/** Why `takeTrialListing` found no slot: the trial is over (or never was), or its listings are all used. */
export async function whyNoTrialListing(
  db: Prisma.TransactionClient,
  agencyId: string,
  now: Date,
): Promise<'TRIAL_ENDED' | 'TRIAL_LISTING_LIMIT_REACHED'> {
  const agency = await db.agency.findUnique({ where: { id: agencyId }, select: { trialEndsAt: true } });
  return isTrialRunning(agency?.trialEndsAt ?? null, now) ? 'TRIAL_LISTING_LIMIT_REACHED' : 'TRIAL_ENDED';
}
