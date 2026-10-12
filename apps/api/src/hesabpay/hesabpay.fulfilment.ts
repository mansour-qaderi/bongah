import { Logger } from '@nestjs/common';
import {
  Prisma,
  PropertyStatus,
  SubscriptionStatus,
  TransactionPurpose,
  type Transaction,
} from '../generated/prisma/client.js';
import { PACKAGE_MONTHS } from './hesabpay.constants.js';
import { addDays, addMonths } from './hesabpay.dates.js';

const logger = new Logger('HesabPayFulfilment');

/**
 * Delivers what a successful payment bought. Runs inside the same database transaction that marks
 * the payment SUCCESS, so either both happen or neither does (and HesabPay's retry gets a second try).
 * What to deliver comes from our own transaction row, never from the webhook.
 */
export async function fulfil(
  db: Prisma.TransactionClient,
  payment: Transaction,
  featuredAdDays: number,
  now: Date,
): Promise<void> {
  switch (payment.purpose) {
    case TransactionPurpose.SUBSCRIPTION:
      return activateSubscription(db, payment, now);
    case TransactionPurpose.LADDER:
      return ladderProperty(db, payment, now);
    case TransactionPurpose.FEATURED_AD:
      return featureProperty(db, payment, featuredAdDays, now);
  }
}

async function activateSubscription(
  db: Prisma.TransactionClient,
  payment: Transaction,
  now: Date,
): Promise<void> {
  const { agencyId, packageType } = payment;
  if (!agencyId || !packageType) {
    throw new Error(`Subscription payment ${payment.id} has no agency or package recorded.`);
  }

  // Serialise purchases for one agency so two simultaneous payments stack instead of overlapping.
  await db.$queryRaw`SELECT id FROM agencies WHERE id = ${agencyId}::uuid FOR UPDATE`;

  // Paying early never wastes days: the new period starts when the current one ends.
  const current = await db.subscription.aggregate({
    where: { agencyId, status: SubscriptionStatus.ACTIVE, endDate: { gt: now } },
    _max: { endDate: true },
  });
  const startDate = current._max.endDate ?? now;

  await db.subscription.create({
    data: {
      agencyId,
      packageType,
      startDate,
      endDate: addMonths(startDate, PACKAGE_MONTHS[packageType]),
      status: SubscriptionStatus.ACTIVE,
      transactionId: payment.id, // UNIQUE: this payment can only ever buy one subscription
    },
  });
}

async function ladderProperty(
  db: Prisma.TransactionClient,
  payment: Transaction,
  now: Date,
): Promise<void> {
  if (!payment.propertyId) {
    throw new Error(`Ladder payment ${payment.id} has no property recorded.`);
  }
  const updated = await db.property.updateMany({
    where: { id: payment.propertyId, status: PropertyStatus.ACTIVE },
    data: { ladderedAt: now },
  });
  if (updated.count === 0) {
    // Paid, but the listing was archived/sold in the meantime. Needs a human (refund or credit).
    logger.warn(`Ladder payment ${payment.id} succeeded but property ${payment.propertyId} is not active.`);
  }
}

async function featureProperty(
  db: Prisma.TransactionClient,
  payment: Transaction,
  days: number,
  now: Date,
): Promise<void> {
  if (!payment.propertyId) {
    throw new Error(`Featured-ad payment ${payment.id} has no property recorded.`);
  }
  // Lock the listing so two simultaneous payments extend the promotion one after the other.
  const rows = await db.$queryRaw<{ featured_until: Date | null; status: PropertyStatus }[]>`
    SELECT featured_until, status::text AS status FROM properties
    WHERE id = ${payment.propertyId}::uuid FOR UPDATE`;
  const property = rows[0];
  if (!property || property.status !== PropertyStatus.ACTIVE) {
    logger.warn(`Featured payment ${payment.id} succeeded but property ${payment.propertyId} is not active.`);
    return;
  }

  // Buying again while still featured adds time to the end instead of overwriting it.
  const base = property.featured_until && property.featured_until > now ? property.featured_until : now;
  await db.property.update({
    where: { id: payment.propertyId },
    data: { isFeatured: true, featuredUntil: addDays(base, days) },
  });
}
