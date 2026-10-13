import { Prisma } from '../generated/prisma/client.js';

/** Everything an admin (or the promote-admin command) can do that leaves a trace. */
export const AUDIT_ACTIONS = [
  'ADMIN_PROMOTED',
  'ADMIN_DEMOTED',
  'USER_BANNED',
  'USER_UNBANNED',
  'AGENCY_VERIFIED',
  'AGENCY_REJECTED',
  'REPORT_DISMISSED',
  'REPORT_RESOLVED',
  'LISTING_REMOVED',
  'LISTING_RESTORED',
  'LISTING_FEATURED',
  'LISTING_UNFEATURED',
  'BANNER_CREATED',
  'BANNER_UPDATED',
  'BANNER_DELETED',
  'PRICE_CHANGED',
  'PRICE_RESET',
  'QUOTE_CREATED',
  'QUOTE_UPDATED',
  'QUOTE_DELETED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditTargetType = 'user' | 'agency' | 'property' | 'report' | 'banner' | 'pricing' | 'quote';

export interface AuditEntry {
  /** The admin who did it; null for the command line. */
  actorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  /** Small facts that explain it (reason, old and new price). Never secrets or phone numbers. */
  metadata?: Prisma.InputJsonObject;
}

/**
 * Writes one audit row. Takes the caller's transaction on purpose: the action and its trace commit
 * together, so there is never an admin action without a log line or a log line for something that rolled back.
 */
export async function recordAudit(db: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await db.adminAuditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? Prisma.JsonNull,
    },
  });
}
