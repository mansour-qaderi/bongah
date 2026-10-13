import type { PerkReason } from '@bongah/shared-types';
import { findActiveSubscription } from '../agencies/subscription.js';
import { Prisma, Role } from '../generated/prisma/client.js';

/**
 * Why this account has the agency perks, or null when it does not. The perks are:
 *  - unlimited, free phone / WhatsApp reveals;
 *  - the advanced chat tools: map pins, high-quality photos, saved replies and the automatic reply.
 *
 *  - ADMIN: always (staff accounts, so support can test every feature).
 *  - AGENCY: while its agency has a running subscription. A lapsed or missing subscription is just
 *    like a regular user.
 *
 * Computed from the subscription rows every time and never stored, so there is no second copy
 * that could say "perks on" a minute after the subscription ended. `agencies.is_verified` is not
 * part of the rule: nothing in the app enforces it yet (it is not required to publish or to pin a
 * map location either). Add it HERE when it is, and every perk follows.
 *
 * `role` must be the role as stored in the database, not the JWT's possibly older copy.
 */
export async function accountPerkReason(
  db: Prisma.TransactionClient,
  userId: string,
  role: Role,
  now: Date,
): Promise<PerkReason | null> {
  if (role === Role.ADMIN) return 'ADMIN';
  if (role !== Role.AGENCY) return null;

  const agency = await db.agency.findUnique({ where: { userId }, select: { id: true } });
  if (!agency) return null;
  return (await findActiveSubscription(db, agency.id, now)) ? 'AGENCY_SUBSCRIPTION' : null;
}
