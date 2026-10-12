import type { MapLocationUnlimitedReason } from '@bongah/shared-types';
import { findActiveSubscription } from '../agencies/subscription.js';
import { Prisma, Role } from '../generated/prisma/client.js';

/**
 * Why this account may pin exact coordinates without a token, or null if it needs one.
 *  - ADMIN: always.
 *  - AGENCY: while its agency has a running subscription. A lapsed or missing subscription is
 *    just like a regular user: tokens only.
 * Everyone else (regular users) gets null.
 */
export async function unlimitedMapLocationReason(
  db: Prisma.TransactionClient,
  userId: string,
  role: Role,
  now: Date,
): Promise<MapLocationUnlimitedReason | null> {
  if (role === Role.ADMIN) return 'ADMIN';
  if (role !== Role.AGENCY) return null;

  const agency = await db.agency.findUnique({ where: { userId }, select: { id: true } });
  if (!agency) return null;
  return (await findActiveSubscription(db, agency.id, now)) ? 'AGENCY_SUBSCRIPTION' : null;
}
