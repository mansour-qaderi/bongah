import { normalizeAfghanMobile } from '@bongah/validation';
import type { PrismaClient } from '../generated/prisma/client.js';
import { promoteToAdmin, type RoleChange } from './admin.bootstrap.js';

/** The developer's own number: the account that is always an admin. */
export const DEFAULT_ADMIN_PHONE = '0790049201';

/** SEED_ADMIN_PHONE overrides the default (a staging server with its own owner, say). */
export function seedAdminPhone(env: Record<string, string | undefined>): string {
  return env.SEED_ADMIN_PHONE?.trim() || DEFAULT_ADMIN_PHONE;
}

/**
 * Makes sure the developer account exists and is an ADMIN. Safe to run again: it changes nothing once the account is
 * an admin. It goes through promoteToAdmin, so the change is audited and the same refusals apply (an agency owner or
 * a banned account is not silently converted).
 *
 * An ADMIN has no listing quota, no subscription requirement and no contact limits: the API checks the role, not a
 * flag on the account, so there is nothing else to provision.
 */
export function seedAdmin(db: PrismaClient, phone: string = DEFAULT_ADMIN_PHONE): Promise<RoleChange> {
  return promoteToAdmin(db, phone);
}

export const isValidSeedPhone = (phone: string): boolean => normalizeAfghanMobile(phone) !== null;
