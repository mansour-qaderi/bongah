import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PropertyStatus } from '../generated/prisma/client.js';
import { addDays } from '../hesabpay/hesabpay.dates.js';

/**
 * The two paid listing promotions. This is the one place that knows what they do:
 *  - Ladder (نردبان): moves the listing to the top of search by setting laddered_at to now.
 *  - Featured: sets is_featured and extends featured_until by a number of days.
 *
 * Eligibility (`assertPromotable`) runs when a payment is started; the effects (`ladder`,
 * `feature`) run when the payment is confirmed. The effects take the caller's database
 * transaction so they commit together with the payment being marked SUCCESS.
 */
@Injectable()
export class PromotionService {
  /**
   * Throws unless `userId` may promote this listing: it must exist, be ACTIVE, and be theirs.
   * Someone else's listing is refused (403), but a missing or archived one is a 404, so ids
   * of listings that are gone say nothing.
   */
  async assertPromotable(db: Prisma.TransactionClient, userId: string, propertyId: string): Promise<void> {
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { userId: true, status: true },
    });
    if (!property || property.status !== PropertyStatus.ACTIVE) {
      throw new NotFoundException('Active property not found.');
    }
    if (property.userId !== userId) {
      throw new ForbiddenException('You can only promote your own listings.');
    }
  }

  /**
   * Moves the listing to the top of search. Returns false (and changes nothing) when the listing
   * is no longer ACTIVE, i.e. it was archived or sold while the payment was open.
   */
  async ladder(db: Prisma.TransactionClient, propertyId: string, now: Date): Promise<boolean> {
    const updated = await db.property.updateMany({
      where: { id: propertyId, status: PropertyStatus.ACTIVE },
      data: { ladderedAt: now },
    });
    return updated.count === 1;
  }

  /**
   * Makes the listing featured for `days` days. Buying again while still featured adds the days
   * to the current end instead of overwriting it. Returns the new end of the promotion, or null
   * (changing nothing) when the listing is no longer ACTIVE.
   *
   * The listing row is locked first, so two payments confirmed at the same moment extend the
   * promotion one after the other instead of both starting from the same end.
   */
  async feature(db: Prisma.TransactionClient, propertyId: string, days: number, now: Date): Promise<Date | null> {
    const rows = await db.$queryRaw<{ featured_until: Date | null; status: PropertyStatus }[]>`
      SELECT featured_until, status::text AS status FROM properties
      WHERE id = ${propertyId}::uuid FOR UPDATE`;
    const property = rows[0];
    if (!property || property.status !== PropertyStatus.ACTIVE) return null;

    const base = property.featured_until && property.featured_until > now ? property.featured_until : now;
    const featuredUntil = addDays(base, days);
    await db.property.update({
      where: { id: propertyId },
      data: { isFeatured: true, featuredUntil },
    });
    return featuredUntil;
  }
}
