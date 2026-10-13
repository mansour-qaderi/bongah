import { ConflictException, NotFoundException } from '@nestjs/common';
import { recordAudit } from '../audit/admin-audit.js';
import { Prisma, PropertyStatus, Role } from '../generated/prisma/client.js';

/**
 * The moderation decisions, as plain functions over a Prisma transaction (like the token and credit
 * helpers), so a report's resolution and the direct admin endpoints run exactly the same code and
 * commit the decision together with its audit line.
 */

/**
 * Bans the account. Returns false (changing nothing) when it was already banned. Admin accounts
 * cannot be banned: demote them first, from the command line.
 */
export async function banUser(
  db: Prisma.TransactionClient,
  actorId: string,
  userId: string,
  reason: string,
  now: Date,
): Promise<boolean> {
  const rows = await db.$queryRaw<{ role: Role; banned_at: Date | null }[]>`
    SELECT role::text AS role, banned_at FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundException('User not found.');
  if (rows[0].role === Role.ADMIN) {
    throw new ConflictException({ message: 'An admin account cannot be banned.', code: 'CANNOT_BAN_ADMIN' });
  }
  if (rows[0].banned_at) return false;

  await db.user.update({ where: { id: userId }, data: { bannedAt: now, banReason: reason } });
  await recordAudit(db, { actorId, action: 'USER_BANNED', targetType: 'user', targetId: userId, metadata: { reason } });
  return true;
}

/** Lifts a ban. Returns false when the account was not banned. */
export async function unbanUser(db: Prisma.TransactionClient, actorId: string, userId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ banned_at: Date | null }[]>`
    SELECT banned_at FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundException('User not found.');
  if (!rows[0].banned_at) return false;

  await db.user.update({ where: { id: userId }, data: { bannedAt: null, banReason: null } });
  await recordAudit(db, { actorId, action: 'USER_UNBANNED', targetType: 'user', targetId: userId });
  return true;
}

/**
 * Takes a listing down: it is archived and flagged as removed by an admin, which its owner cannot
 * undo. Returns false when it was already taken down.
 */
export async function takeDownListing(
  db: Prisma.TransactionClient,
  actorId: string,
  propertyId: string,
  reason: string,
  now: Date,
): Promise<boolean> {
  const rows = await db.$queryRaw<{ removed_by_admin_at: Date | null }[]>`
    SELECT removed_by_admin_at FROM properties WHERE id = ${propertyId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundException('Property not found.');
  if (rows[0].removed_by_admin_at) return false;

  await db.property.update({
    where: { id: propertyId },
    data: { status: PropertyStatus.ARCHIVED, removedByAdminAt: now, removalReason: reason },
  });
  await recordAudit(db, {
    actorId,
    action: 'LISTING_REMOVED',
    targetType: 'property',
    targetId: propertyId,
    metadata: { reason },
  });
  return true;
}

/**
 * Brings a taken-down listing back as ACTIVE. (Whether it was sold before the takedown is not kept:
 * an admin who restores a listing should check its status afterwards.)
 */
export async function restoreListing(db: Prisma.TransactionClient, actorId: string, propertyId: string): Promise<void> {
  const rows = await db.$queryRaw<{ removed_by_admin_at: Date | null }[]>`
    SELECT removed_by_admin_at FROM properties WHERE id = ${propertyId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundException('Property not found.');
  if (!rows[0].removed_by_admin_at) {
    throw new ConflictException({ message: 'This listing was not taken down.', code: 'LISTING_NOT_REMOVED' });
  }
  await db.property.update({
    where: { id: propertyId },
    data: { status: PropertyStatus.ACTIVE, removedByAdminAt: null, removalReason: null },
  });
  await recordAudit(db, { actorId, action: 'LISTING_RESTORED', targetType: 'property', targetId: propertyId });
}
