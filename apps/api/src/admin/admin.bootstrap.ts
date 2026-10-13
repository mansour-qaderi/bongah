import { normalizeAfghanMobile } from '@bongah/validation';
import { recordAudit } from '../audit/admin-audit.js';
import { Role, type PrismaClient } from '../generated/prisma/client.js';

export interface RoleChange {
  userId: string;
  phoneNumber: string;
  /** The account did not exist and was created (it can sign in with its phone number as usual). */
  created: boolean;
  /** Nothing needed changing. */
  unchanged: boolean;
}

/** A refusal the command line shows as-is (wrong phone number, account cannot become an admin, ...). */
export class RoleChangeError extends Error {}

/**
 * Makes the account with this phone number an ADMIN, creating the account if it does not exist yet.
 * This is the ONLY way to get an admin: no API endpoint can grant the role, so a stolen admin session
 * or a bug in the panel cannot mint more admins.
 *
 * Refuses an account that owns an agency (admins cannot register one, so the two roles do not mix) and
 * one that is banned (lift the ban first: an admin cannot be banned).
 */
export async function promoteToAdmin(db: PrismaClient, phoneInput: string): Promise<RoleChange> {
  const phoneNumber = normalizeAfghanMobile(phoneInput);
  if (!phoneNumber) throw new RoleChangeError(`"${phoneInput}" is not a valid Afghan mobile number.`);

  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { phoneNumber },
      select: { id: true, role: true, bannedAt: true, agency: { select: { id: true } } },
    });

    if (!existing) {
      const created = await tx.user.create({ data: { phoneNumber, role: Role.ADMIN } });
      await recordAudit(tx, { actorId: null, action: 'ADMIN_PROMOTED', targetType: 'user', targetId: created.id });
      return { userId: created.id, phoneNumber, created: true, unchanged: false };
    }
    if (existing.role === Role.ADMIN) return { userId: existing.id, phoneNumber, created: false, unchanged: true };
    if (existing.agency) {
      throw new RoleChangeError('This account owns an agency. Admin accounts cannot own one: use a different number.');
    }
    if (existing.bannedAt) throw new RoleChangeError('This account is banned. Unban it first.');

    await tx.user.update({ where: { id: existing.id }, data: { role: Role.ADMIN } });
    await recordAudit(tx, { actorId: null, action: 'ADMIN_PROMOTED', targetType: 'user', targetId: existing.id });
    return { userId: existing.id, phoneNumber, created: false, unchanged: false };
  });
}

/** Turns an admin back into a regular user. Takes effect on their next request (the role is read from the database every time). */
export async function demoteAdmin(db: PrismaClient, phoneInput: string): Promise<RoleChange> {
  const phoneNumber = normalizeAfghanMobile(phoneInput);
  if (!phoneNumber) throw new RoleChangeError(`"${phoneInput}" is not a valid Afghan mobile number.`);

  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { phoneNumber }, select: { id: true, role: true } });
    if (!existing) throw new RoleChangeError('No account has this phone number.');
    if (existing.role !== Role.ADMIN) return { userId: existing.id, phoneNumber, created: false, unchanged: true };

    await tx.user.update({ where: { id: existing.id }, data: { role: Role.USER } });
    await recordAudit(tx, { actorId: null, action: 'ADMIN_DEMOTED', targetType: 'user', targetId: existing.id });
    return { userId: existing.id, phoneNumber, created: false, unchanged: false };
  });
}
