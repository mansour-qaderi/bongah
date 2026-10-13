import { Logger } from '@nestjs/common';
import {
  ContactCreditSource,
  MapLocationTokenSource,
  Prisma,
  SubscriptionStatus,
  TransactionPurpose,
  type Transaction,
} from '../generated/prisma/client.js';
import { grantContactCredits } from '../contact/contact.credits.js';
import { grantMapLocationToken } from '../map-location/map-location.tokens.js';
import type { PromotionService } from '../promotion/promotion.service.js';
import { PACKAGE_MONTHS } from './hesabpay.constants.js';
import { addMonths } from './hesabpay.dates.js';

const logger = new Logger('HesabPayFulfilment');

/**
 * Delivers what a successful payment bought. Runs inside the same database transaction that marks
 * the payment SUCCESS, so either both happen or neither does (and HesabPay's retry gets a second try).
 * What to deliver comes from our own transaction row, never from the webhook.
 * Ladder and featured purchases are carried out by the PromotionService.
 */
export async function fulfil(
  db: Prisma.TransactionClient,
  payment: Transaction,
  featuredAdDays: number,
  now: Date,
  promotion: PromotionService,
): Promise<void> {
  switch (payment.purpose) {
    case TransactionPurpose.SUBSCRIPTION:
      return activateSubscription(db, payment, now);
    case TransactionPurpose.LADDER:
      return ladderProperty(db, payment, now, promotion);
    case TransactionPurpose.FEATURED_AD:
      // The days were recorded when the payment started; older payments (before that) use the configured default.
      return featureProperty(db, payment, payment.quantity ?? featuredAdDays, now, promotion);
    case TransactionPurpose.MAP_LOCATION:
      // transaction_id is UNIQUE on tokens: this payment can only ever mint one.
      return grantMapLocationToken(db, {
        userId: payment.userId,
        source: MapLocationTokenSource.PURCHASE,
        transactionId: payment.id,
      });
    case TransactionPurpose.CONTACT_CREDITS:
      return grantPurchasedContactCredits(db, payment);
  }
}

async function grantPurchasedContactCredits(db: Prisma.TransactionClient, payment: Transaction): Promise<void> {
  // The pack size was recorded when the payment started, so a later config change cannot give the
  // buyer something other than what they were quoted.
  if (!payment.quantity) {
    throw new Error(`Contact-credits payment ${payment.id} has no quantity recorded.`);
  }
  // transaction_id is UNIQUE on credits: this payment can only ever mint one batch.
  await grantContactCredits(db, {
    userId: payment.userId,
    source: ContactCreditSource.PURCHASE,
    amount: payment.quantity,
    transactionId: payment.id,
  });
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
  promotion: PromotionService,
): Promise<void> {
  if (!payment.propertyId) {
    throw new Error(`Ladder payment ${payment.id} has no property recorded.`);
  }
  if (!(await promotion.ladder(db, payment.propertyId, now))) {
    // Paid, but the listing was archived/sold in the meantime. Needs a human (refund or credit).
    logger.warn(`Ladder payment ${payment.id} succeeded but property ${payment.propertyId} is not active.`);
  }
}

async function featureProperty(
  db: Prisma.TransactionClient,
  payment: Transaction,
  days: number,
  now: Date,
  promotion: PromotionService,
): Promise<void> {
  if (!payment.propertyId) {
    throw new Error(`Featured-ad payment ${payment.id} has no property recorded.`);
  }
  if ((await promotion.feature(db, payment.propertyId, days, now)) === null) {
    logger.warn(`Featured payment ${payment.id} succeeded but property ${payment.propertyId} is not active.`);
  }
}
